import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ACTIVITY_LEVELS,
    HEIGHT_UNITS,
    WEIGHT_UNITS,
    type ActivityLevel,
    type HeightUnit,
    type WeightUnit
} from '@calibrate/shared';
import {
    ApiError,
    type CaloriePlanOptionsRequest,
    type OnboardingDraftResponse,
    type OnboardingStep
} from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../src/components/AsyncStateBoundary';
import { CalibrateLogo } from '../src/components/CalibrateLogo';
import { HealthConnectOnboardingStep } from '../src/components/HealthConnectOnboardingStep';
import { LoadingState } from '../src/components/LoadingState';
import { KeyboardAwareScrollView } from '../src/components/KeyboardAwareScrollView';
import { NumberStepperField } from '../src/components/NumberStepperField';
import { GoalDailyChangeSelect } from '../src/components/GoalDailyChangeSelect';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { WearPairingCard } from '../src/components/WearPairingCard';
import {
    ProfileEnergyFields,
    ProfileIdentityFields
} from '../src/components/profile/ProfileDetailsFields';
import { useAuth } from '../src/auth/AuthContext';
import { restrictedAccountRoute } from '../src/auth/accountAccess';
import { getTodayDate } from '../src/utils/dates';
import { formatWeightUnit } from '../src/utils/format';
import {
    DAILY_GOAL_CHANGE_OPTIONS,
    formatDailyGoalChange,
    getSignedDailyDeficit,
    GOAL_MODE_OPTIONS,
    type GoalMode
} from '../src/utils/goals';
import { ACTIVITY_OPTIONS, SEX_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../src/utils/profileOptions';
import { getKeyboardAvoidingBehavior } from '../src/utils/keyboard';
import { detectDeviceTimeZone, formatTimeZoneLabel, resolveOnboardingTimeZone } from '../src/utils/timezones';
import {
    getNextButtonTitle,
    getOnboardingSteps,
    isPostCompletionStep,
    type OnboardingStepKey
} from '../src/onboarding/steps';
import {
    buildOnboardingCompleteData,
    buildOnboardingDraftData,
    hydrateOnboardingDraft,
    ONBOARDING_DRAFT_SCHEMA_VERSION,
    type OnboardingFormState
} from '../src/onboarding/draftState';
import { OnboardingProgress } from '../src/onboarding/OnboardingProgress';
import { OnboardingCompletionRecovery } from '../src/onboarding/OnboardingCompletionRecovery';
import { radius, spacing, useAppTheme } from '../src/theme';
import { WEIGHT_INPUT_INCREMENT } from '../src/config/inputPrecision';
import { ASYNC_RESOURCE_STATES, isNeverEmpty } from '../src/asyncState/resolveAsyncState';
import { getSafeActionErrorMessage } from '../src/errors/presentation';
import { useOfflineOutbox } from '../src/offline/provider';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../src/offline/operations';
import { getCaloriePlanPresentation } from '../src/caloriePlanning/presentation';
import { getMinimumDateOfBirth } from '../src/caloriePlanning/dateBounds';
import { getHeightPolicyError, isHeightWithinPolicy } from '../src/caloriePlanning/heightInput';
import {
    getWeightDisplayBounds,
    getWeightPolicyError,
    isWeightWithinPolicy
} from '../src/weightEntry/input';

const ONBOARDING_CONTENT_MAX_WIDTH = 760; // Keeps the wizard and its error gate readable on desktop.
const ONBOARDING_DRAFT_QUERY_KEY = ['mobile-onboarding-draft'] as const;

function getTargetWeightForGoal(goalMode: GoalMode, currentWeight: string, targetWeight: string): string {
    if (goalMode === 'maintain' && targetWeight.trim().length === 0) {
        return currentWeight;
    }
    return targetWeight;
}

function validateGoal(
    goalMode: GoalMode,
    currentWeight: number,
    targetWeight: number,
    weightUnit: WeightUnit
): string | null {
    if (!Number.isFinite(currentWeight) || currentWeight <= 0 || !Number.isFinite(targetWeight) || targetWeight <= 0) {
        return 'Enter a valid current and target weight.';
    }
    if (!isWeightWithinPolicy(currentWeight, weightUnit) || !isWeightWithinPolicy(targetWeight, weightUnit)) {
        return getWeightPolicyError(weightUnit);
    }
    if (goalMode === 'lose' && targetWeight >= currentWeight) {
        return 'For a loss goal, target weight must be below current weight.';
    }
    if (goalMode === 'gain' && targetWeight <= currentWeight) {
        return 'For a gain goal, target weight must be above current weight.';
    }
    return null;
}

export default function OnboardingScreen() {
    const { colors: themeColors } = useAppTheme();
    const { fontScale } = useWindowDimensions();
    const { api, user, isLoading: isAuthLoading, updateCurrentUser } = useAuth();
    const queryClient = useQueryClient();
    const accountAccessRoute = restrictedAccountRoute(user);
    const draftQuery = useQuery({
        queryKey: ONBOARDING_DRAFT_QUERY_KEY,
        queryFn: () => api.getOnboardingDraft(),
        enabled: Boolean(user && !accountAccessRoute && !user.onboarding_completed_at)
    });
    const draftResourceState = useAsyncResourceState(draftQuery, isNeverEmpty);
    const refetchOnboardingDraft = draftQuery.refetch;
    const isOnline = useOnlineStatus();
    const {
        enqueue,
        mutations: offlineMutations,
        retryFailed: retryFailedMutation
    } = useOfflineOutbox();
    const onboardingSteps = useMemo(() => getOnboardingSteps(Platform.OS), []);
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const activeStep = onboardingSteps[activeStepIndex];
    const nextStep = onboardingSteps[activeStepIndex + 1];
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(user?.weight_unit ?? WEIGHT_UNITS.KG);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(user?.height_unit ?? HEIGHT_UNITS.CM);
    const deviceTimeZone = useMemo(detectDeviceTimeZone, []);
    const hasStartedProfile = Boolean(user?.date_of_birth || user?.sex || user?.height_mm || user?.activity_level);
    const [timezone, setTimezone] = useState(() => resolveOnboardingTimeZone(user?.timezone, deviceTimeZone, hasStartedProfile));
    const [currentWeight, setCurrentWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [goalMode, setGoalMode] = useState<GoalMode>('lose');
    const [dailyChangeAbs, setDailyChangeAbs] = useState('500');
    const [isDailyChangeSelectorOpen, setIsDailyChangeSelectorOpen] = useState(false);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [sex, setSex] = useState<(typeof SEX_OPTIONS)[number]['value'] | null>(null);
    const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(ACTIVITY_LEVELS.LIGHT);
    const [heightCm, setHeightCm] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [draftRevision, setDraftRevision] = useState<number | null>(null);
    const [draftSaveFailed, setDraftSaveFailed] = useState(false);
    const [draftStatus, setDraftStatus] = useState<string | null>(null);
    const [setupSaved, setSetupSaved] = useState(false);
    const [queuedCompletionOperationId, setQueuedCompletionOperationId] = useState<string | null>(null);
    const [isRetryingCompletion, setIsRetryingCompletion] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
    const weightBounds = getWeightDisplayBounds(weightUnit);
    const optionalStartIndex = onboardingSteps.findIndex(({ key }) => isPostCompletionStep(key));
    const minimumSelectableStepIndex = setupSaved && optionalStartIndex >= 0 ? optionalStartIndex : 0;
    const queuedCompletionMutation = offlineMutations.find(
        ({ operation }) => operation === OFFLINE_MUTATION_OPERATIONS.COMPLETE_ONBOARDING
    );
    const hasQueuedCompletion = queuedCompletionOperationId !== null || queuedCompletionMutation !== undefined;

    const signedDailyDeficit = getSignedDailyDeficit(goalMode, dailyChangeAbs);
    const hasExplicitDailyChange = goalMode === 'maintain'
        || DAILY_GOAL_CHANGE_OPTIONS.some((value) => String(value) === dailyChangeAbs);
    const resolvedTargetWeight = getTargetWeightForGoal(goalMode, currentWeight, targetWeight);
    const caloriePlanDraft = useMemo<CaloriePlanOptionsRequest | null>(() => {
        const parsedWeight = Number(currentWeight);
        const parsedHeightCm = Number(heightCm);
        const parsedHeightFeet = Number(heightFeet);
        const parsedHeightInches = Number(heightInches || '0');
        if (
            !timezone.trim() ||
            !dateOfBirth.trim() ||
            !sex ||
            !activityLevel ||
            !Number.isFinite(parsedWeight) ||
            (heightUnit === HEIGHT_UNITS.CM
                ? !Number.isFinite(parsedHeightCm)
                : !Number.isFinite(parsedHeightFeet) || !Number.isFinite(parsedHeightInches))
        ) {
            return null;
        }
        return {
            timezone: timezone.trim(),
            date_of_birth: dateOfBirth,
            sex,
            activity_level: activityLevel,
            height: heightUnit === HEIGHT_UNITS.CM
                ? { unit: 'CM', centimeters: parsedHeightCm }
                : { unit: 'FT_IN', feet: parsedHeightFeet, inches: parsedHeightInches },
            weight: { unit: weightUnit, value: parsedWeight }
        };
    }, [
        activityLevel,
        currentWeight,
        dateOfBirth,
        heightCm,
        heightFeet,
        heightInches,
        heightUnit,
        sex,
        timezone,
        weightUnit
    ]);
    const planOptionsQuery = useQuery({
        queryKey: ['calorie-plan-options', caloriePlanDraft],
        queryFn: () => api.getCaloriePlanOptions(caloriePlanDraft!),
        enabled: caloriePlanDraft !== null
    });
    const planPreviewState = useAsyncResourceState(planOptionsQuery, isNeverEmpty);
    const selectedPlanOption = hasExplicitDailyChange
        ? planOptionsQuery.data?.planOptions.find((option) => option.dailyDeficit === signedDailyDeficit)
        : undefined;
    const canSubmit = currentWeight.trim().length > 0 &&
        resolvedTargetWeight.trim().length > 0 &&
        timezone.trim().length > 0 &&
        dateOfBirth.trim().length > 0 &&
        Boolean(sex) &&
        Boolean(activityLevel) &&
        (heightUnit === HEIGHT_UNITS.CM ? heightCm.trim().length > 0 : heightFeet.trim().length > 0) &&
        hasExplicitDailyChange &&
        planOptionsQuery.data?.eligibility.status === 'eligible' &&
        selectedPlanOption?.available === true;

    useEffect(() => {
        if (goalMode === 'maintain' || !dailyChangeAbs || !planOptionsQuery.data) return;
        if (selectedPlanOption?.available !== true) {
            setDailyChangeAbs('');
            setIsDailyChangeSelectorOpen(false);
        }
    }, [dailyChangeAbs, goalMode, planOptionsQuery.data, selectedPlanOption?.available]);

    useEffect(() => {
        const response = draftQuery.data;
        if (!response) return;
        if (!response.draft) {
            setDraftRevision(null);
            return;
        }

        const hydrated = hydrateOnboardingDraft(response.draft, {
            weightUnit: user?.weight_unit ?? WEIGHT_UNITS.KG,
            heightUnit: user?.height_unit ?? HEIGHT_UNITS.CM,
            timezone: resolveOnboardingTimeZone(user?.timezone, deviceTimeZone, false)
        });
        setWeightUnit(hydrated.weightUnit);
        setHeightUnit(hydrated.heightUnit);
        setTimezone(hydrated.timezone);
        setDateOfBirth(hydrated.dateOfBirth);
        setSex(hydrated.sex);
        setActivityLevel(hydrated.activityLevel);
        setCurrentWeight(hydrated.currentWeight);
        setTargetWeight(hydrated.targetWeight);
        setGoalMode(hydrated.goalMode);
        setDailyChangeAbs(hydrated.dailyChangeAbs);
        setHeightCm(hydrated.heightCm);
        setHeightFeet(hydrated.heightFeet);
        setHeightInches(hydrated.heightInches);
        setDraftRevision(response.draft.revision);
        const resumeIndex = onboardingSteps.findIndex(({ key }) => key === hydrated.resumeStep);
        setActiveStepIndex(resumeIndex >= 0 ? resumeIndex : 0);
        setDraftStatus(response.recovered_from_legacy ? 'Recovered your previous setup.' : 'Saved setup loaded.');
    }, [
        deviceTimeZone,
        draftQuery.data,
        onboardingSteps,
        user?.height_unit,
        user?.timezone,
        user?.weight_unit
    ]);

    useEffect(() => {
        if (!queuedCompletionOperationId) {
            if (queuedCompletionMutation) {
                setQueuedCompletionOperationId(queuedCompletionMutation.id);
                setDraftStatus('Setup completion is waiting for a connection and will retry automatically.');
            }
            return;
        }
        if (queuedCompletionMutation) return;

        let active = true;
        void refetchOnboardingDraft().then(({ data }) => {
            if (!active) return;
            setQueuedCompletionOperationId(null);
            if (!data?.onboarding_completed_at) {
                setDraftStatus(null);
                setValidationError('Unable to confirm setup completion. Select Complete setup to retry safely.');
                return;
            }

            if (user) {
                updateCurrentUser({ ...user, onboarding_completed_at: data.onboarding_completed_at });
            }
            setSetupSaved(true);
            setDraftRevision(null);
            setValidationError(null);
            setDraftStatus('Setup complete. Optional steps will not change your calorie plan.');
            if (optionalStartIndex >= 0) setActiveStepIndex(optionalStartIndex);
        });
        return () => {
            active = false;
        };
    }, [
        offlineMutations,
        optionalStartIndex,
        queuedCompletionOperationId,
        refetchOnboardingDraft,
        updateCurrentUser,
        user
    ]);

    function getFormState(): OnboardingFormState {
        return {
            weightUnit,
            heightUnit,
            timezone,
            dateOfBirth,
            sex,
            activityLevel,
            currentWeight,
            targetWeight: resolvedTargetWeight,
            goalMode,
            dailyChangeAbs,
            heightCm,
            heightFeet,
            heightInches
        };
    }

    const saveDraftMutation = useMutation({
        mutationFn: ({
            completedThrough,
            currentStep
        }: {
            completedThrough: OnboardingStepKey;
            currentStep: OnboardingStep;
        }) => api.saveOnboardingDraft({
            schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
            ...(draftRevision === null ? {} : { revision: draftRevision }),
            current_step: currentStep,
            data: buildOnboardingDraftData(getFormState(), completedThrough)
        }),
        onMutate: () => {
            setDraftSaveFailed(false);
            setDraftStatus('Saving progress...');
        },
        onSuccess: ({ draft }) => {
            setDraftRevision(draft.revision);
            setDraftStatus('Progress saved.');
        },
        onError: () => {
            setDraftSaveFailed(true);
            setDraftStatus(null);
        }
    });

    const completionMutation = useMutation({
        mutationFn: () => {
            const payload = {
                schema_version: ONBOARDING_DRAFT_SCHEMA_VERSION,
                ...(draftRevision === null ? {} : { expected_revision: draftRevision }),
                data: buildOnboardingCompleteData(getFormState())
            };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.COMPLETE_ONBOARDING,
                payload,
                execute: (operationId) => api.completeOnboarding(payload, operationId),
                enqueue
            });
        },
        onSuccess: async (result) => {
            setValidationError(null);
            if (result.disposition === 'queued') {
                setQueuedCompletionOperationId(result.operationId);
                setDraftStatus('Setup completion is waiting for a connection and will retry automatically.');
                return;
            }

            updateCurrentUser(result.value.user);
            setSetupSaved(true);
            queryClient.setQueryData<OnboardingDraftResponse>(ONBOARDING_DRAFT_QUERY_KEY, {
                draft: null,
                recovered_from_legacy: false,
                onboarding_completed_at: result.value.receipt.completed_at
            });
            if (optionalStartIndex >= 0) {
                setActiveStepIndex(optionalStartIndex);
                setDraftStatus('Setup complete. Optional steps will not change your calorie plan.');
                return;
            }
            await finishOnboarding();
        },
        onError: async (error) => {
            if (error instanceof ApiError && error.code === 'ONBOARDING_DRAFT_CONFLICT') {
                await refetchOnboardingDraft();
                setValidationError('Setup changed on another device. We loaded the latest saved version for you to review.');
                return;
            }
            setValidationError(getSafeActionErrorMessage(error, 'Unable to complete setup. Try again.'));
        }
    });

    const importMutation = useMutation({
        mutationFn: async () => {
            const DocumentPicker = await import('expo-document-picker');
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/zip',
                copyToCacheDirectory: true
            });
            if (result.canceled || result.assets.length === 0) return null;
            const asset = result.assets[0];
            return api.executeLoseItImport({
                uri: asset.uri,
                name: asset.name ?? 'loseit-export.zip',
                type: asset.mimeType ?? 'application/zip'
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries();
        }
    });

    if (isAuthLoading) {
        return <LoadingState label="Checking your session..." />;
    }
    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }
    if (accountAccessRoute) {
        return <Redirect href={accountAccessRoute} />;
    }
    if (user.onboarding_completed_at && !setupSaved) {
        return <Redirect href="/today" />;
    }

    if (draftResourceState.kind === ASYNC_RESOURCE_STATES.LOADING) {
        return <LoadingState label="Loading saved setup..." />;
    }

    if (draftResourceState.kind === ASYNC_RESOURCE_STATES.ERROR) {
        return (
            <Screen safeTop style={[styles.profileGate, { backgroundColor: themeColors.background }]}>
                <AsyncStateBoundary
                    state={draftResourceState}
                    resourceLabel="your saved setup"
                    loading={<LoadingState label="Loading saved setup..." />}
                    empty={null}
                    onRetry={isOnline ? refetchOnboardingDraft : undefined}
                >
                    {null}
                </AsyncStateBoundary>
            </Screen>
        );
    }

    if (!setupSaved && draftQuery.data?.onboarding_completed_at) {
        return <Redirect href="/today" />;
    }

    function handleGoalModeChange(nextMode: GoalMode) {
        setGoalMode(nextMode);
        setIsDailyChangeSelectorOpen(false);
        if (nextMode === 'maintain' && currentWeight.trim().length > 0) {
            setTargetWeight(currentWeight);
        }
    }

    function validateStep(step: OnboardingStepKey): string | null {
        switch (step) {
            case 'goal':
                return validateGoal(goalMode, Number(currentWeight), Number(resolvedTargetWeight), weightUnit);
            case 'pace':
                if (planOptionsQuery.isError) {
                    return 'Retry the calorie plan check before continuing.';
                }
                if (planOptionsQuery.isPending || !planOptionsQuery.data) {
                    return 'Wait for Calibrate to check the available calorie plans.';
                }
                if (planOptionsQuery.data.eligibility.status !== 'eligible') {
                    return getCaloriePlanPresentation(
                        planOptionsQuery.data.eligibility.reasonCode
                    ).message;
                }
                if (goalMode !== 'maintain' && !DAILY_GOAL_CHANGE_OPTIONS.some((value) => String(value) === dailyChangeAbs)) {
                    return 'Choose a daily calorie change.';
                }
                if (selectedPlanOption?.available !== true) {
                    return getCaloriePlanPresentation(selectedPlanOption?.reasonCode).message;
                }
                return null;
            case 'about':
                if (!dateOfBirth.trim() || !sex) {
                    return 'Add your date of birth and sex.';
                }
                return null;
            case 'burn':
                if (!activityLevel) {
                    return 'Choose an activity level.';
                }
                if (heightUnit === HEIGHT_UNITS.CM && !heightCm.trim()) {
                    return 'Enter your height.';
                }
                if (heightUnit === HEIGHT_UNITS.FT_IN && !heightFeet.trim()) {
                    return 'Enter your height.';
                }
                if (!isHeightWithinPolicy({
                    unit: heightUnit,
                    centimeters: Number(heightCm),
                    feet: Number(heightFeet),
                    inches: Number(heightInches || '0')
                })) {
                    return getHeightPolicyError(heightUnit);
                }
                if (!timezone.trim()) {
                    return 'Enter your timezone.';
                }
                return null;
            case 'import':
            case 'health':
            case 'watch':
            case 'review':
                return null;
        }
    }

    async function handleNext() {
        setValidationError(null);
        const stepError = validateStep(activeStep.key);
        if (stepError) {
            setValidationError(stepError);
            return;
        }

        if (activeStep.key === 'review') {
            if (setupSaved) {
                setActiveStepIndex((current) => Math.min(current + 1, onboardingSteps.length - 1));
            } else {
                completionMutation.mutate();
            }
            return;
        }

        if (!nextStep) {
            void finishOnboarding();
            return;
        }

        if (!setupSaved && !isPostCompletionStep(activeStep.key)) {
            try {
                await saveDraftMutation.mutateAsync({
                    completedThrough: activeStep.key,
                    currentStep: nextStep.key as OnboardingStep
                });
            } catch (error) {
                if (error instanceof ApiError && error.code === 'ONBOARDING_DRAFT_CONFLICT') {
                    await refetchOnboardingDraft();
                    setValidationError('Setup changed on another device. We loaded the latest saved version for you to review.');
                } else {
                    setValidationError(getSafeActionErrorMessage(
                        error,
                        'Unable to save progress. Select Retry save to try again.'
                    ));
                }
                return;
            }
        }

        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.min(current + 1, onboardingSteps.length - 1));
    }

    function handleBack() {
        setValidationError(null);
        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.max(current - 1, minimumSelectableStepIndex));
    }

    async function handleRetryCompletion() {
        if (!queuedCompletionMutation || isRetryingCompletion) return;
        setIsRetryingCompletion(true);
        setValidationError(null);
        try {
            const result = await retryFailedMutation(queuedCompletionMutation.id);
            if (result.failedMutation) {
                setValidationError('Setup completion could not be confirmed. Check your connection and try again.');
                return;
            }
            setDraftStatus('Confirming setup completion...');
        } catch (error) {
            setValidationError(getSafeActionErrorMessage(
                error,
                'Unable to retry setup completion. Try again.'
            ));
        } finally {
            setIsRetryingCompletion(false);
        }
    }

    async function finishOnboarding() {
        if (isFinishing) return;
        setIsFinishing(true);
        setValidationError(null);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ONBOARDING_DRAFT_QUERY_KEY }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-goal'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] })
            ]);
            router.replace('/today');
        } catch (error) {
            setValidationError(getSafeActionErrorMessage(error, 'Unable to finish setup.'));
        } finally {
            setIsFinishing(false);
        }
    }

    function renderStepContent() {
        switch (activeStep.key) {
            case 'goal':
                return (
                    <>
                        <SegmentedControl options={GOAL_MODE_OPTIONS} value={goalMode} onChange={handleGoalModeChange} />
                        <AppText variant="muted">
                            Select the direction first. We will keep the target consistent with that choice.
                        </AppText>
                        <View style={styles.fieldStack}>
                            <NumberStepperField
                                label="Current"
                                value={currentWeight}
                                onChangeText={(value) => {
                                    setCurrentWeight(value);
                                    if (goalMode === 'maintain') setTargetWeight(value);
                                }}
                                step={WEIGHT_INPUT_INCREMENT}
                                min={weightBounds.minimum}
                                max={weightBounds.maximum}
                                suffix={formatWeightUnit(weightUnit)}
                            />
                            <NumberStepperField
                                label={goalMode === 'maintain' ? 'Maintain at' : 'Target'}
                                value={resolvedTargetWeight}
                                onChangeText={setTargetWeight}
                                step={WEIGHT_INPUT_INCREMENT}
                                min={weightBounds.minimum}
                                max={weightBounds.maximum}
                                suffix={formatWeightUnit(weightUnit)}
                            />
                        </View>
                        <AppText variant="label">Weight unit</AppText>
                        <SegmentedControl options={WEIGHT_UNIT_OPTIONS} value={weightUnit} onChange={setWeightUnit} />
                    </>
                );
            case 'pace':
                return (
                    <>
                        {goalMode === 'maintain' ? (
                            <View style={[styles.infoPanel, { backgroundColor: themeColors.primaryContainer }]}>
                                <Ionicons name="remove-circle-outline" size={18} color={themeColors.onPrimaryContainer} />
                                <AppText style={[styles.infoText, { color: themeColors.onPrimaryContainer }]}>
                                    Maintenance uses a steady calorie target with no planned deficit or surplus.
                                </AppText>
                            </View>
                        ) : (
                            <>
                                <AppText variant="label">Daily calorie change</AppText>
                                <GoalDailyChangeSelect
                                    goalMode={goalMode}
                                    value={dailyChangeAbs}
                                    isOpen={isDailyChangeSelectorOpen}
                                    onToggle={() => setIsDailyChangeSelectorOpen((current) => !current)}
                                    onChange={(value) => {
                                        setDailyChangeAbs(value);
                                        setIsDailyChangeSelectorOpen(false);
                                    }}
                                    planOptions={planOptionsQuery.data?.planOptions}
                                />
                            </>
                        )}
                        <AsyncStateBoundary
                            state={planPreviewState}
                            resourceLabel="calorie plan options"
                            loading={<AppText variant="muted">Checking available calorie plans...</AppText>}
                            empty={<AppText variant="muted">No calorie plan options are available.</AppText>}
                            onRetry={isOnline ? () => planOptionsQuery.refetch() : undefined}
                            retrying={planOptionsQuery.isFetching}
                        >
                            {planOptionsQuery.data && (
                                planOptionsQuery.data.eligibility.status === 'eligible' ? (
                                    <AppText variant="muted">
                                        {selectedPlanOption?.dailyCalorieTarget
                                            ? `Server target: ${selectedPlanOption.dailyCalorieTarget.toLocaleString()} kcal/day. Minimum: ${planOptionsQuery.data.minimumDailyCalorieTarget?.toLocaleString() ?? '-'} kcal/day.`
                                            : 'Choose an available option to see the server-calculated target.'}
                                    </AppText>
                                ) : (
                                    <View style={[styles.infoPanel, { backgroundColor: themeColors.warningContainer }]}>
                                        <Ionicons name="information-circle-outline" size={18} color={themeColors.onWarningContainer} />
                                        <AppText style={[styles.infoText, { color: themeColors.onWarningContainer }]}>
                                            {getCaloriePlanPresentation(
                                                planOptionsQuery.data.eligibility.reasonCode
                                            ).message}
                                        </AppText>
                                    </View>
                                )
                            )}
                        </AsyncStateBoundary>
                        <PlanSummary
                            currentWeight={currentWeight}
                            targetWeight={resolvedTargetWeight}
                            unit={formatWeightUnit(weightUnit)}
                            signedDailyDeficit={signedDailyDeficit}
                        />
                    </>
                );
            case 'about':
                return (
                    <ProfileIdentityFields
                        dateOfBirth={dateOfBirth}
                        minimumDate={getMinimumDateOfBirth(getTodayDate(timezone))}
                        maximumDate={getTodayDate(timezone)}
                        onDateOfBirthChange={setDateOfBirth}
                        sex={sex}
                        onSexChange={setSex}
                    />
                );
            case 'burn':
                return (
                    <ProfileEnergyFields
                        activityLevel={activityLevel}
                        onActivityLevelChange={setActivityLevel}
                        heightUnit={heightUnit}
                        onHeightUnitChange={setHeightUnit}
                        heightCm={heightCm}
                        onHeightCmChange={setHeightCm}
                        heightFeet={heightFeet}
                        onHeightFeetChange={setHeightFeet}
                        heightInches={heightInches}
                        onHeightInchesChange={setHeightInches}
                        timezone={timezone}
                        onTimezoneChange={setTimezone}
                    />
                );
            case 'import':
                return (
                    <>
                        <View style={[styles.infoPanel, { backgroundColor: themeColors.primaryContainer }]}>
                            <Ionicons name="cloud-upload-outline" size={18} color={themeColors.onPrimaryContainer} />
                            <AppText style={[styles.infoText, { color: themeColors.onPrimaryContainer }]}>
                                Importing is optional. You can start fresh now and import later from Account.
                            </AppText>
                        </View>
                        {importMutation.data && (
                            <>
                                <AppText variant="muted">
                                    Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                                </AppText>
                                {importMutation.data.foodDayCompletionMessage && (
                                    <AppText variant="muted">{importMutation.data.foodDayCompletionMessage}</AppText>
                                )}
                            </>
                        )}
                        {importMutation.error && (
                            <AppText accessibilityRole="alert" style={{ color: themeColors.danger }}>
                                {getSafeActionErrorMessage(importMutation.error, 'Unable to import that ZIP file.')}
                            </AppText>
                        )}
                        <AppButton
                            title={importMutation.isPending ? 'Importing...' : 'Import Lose It ZIP'}
                            variant="secondary"
                            leftIcon={<Ionicons name="cloud-upload-outline" size={18} color={themeColors.onSurface} />}
                            onPress={() => importMutation.mutate()}
                        />
                    </>
                );
            case 'health':
                return (
                    <>
                        <ConnectionStepIntro
                            icon="fitness-outline"
                            title="Activity, without extra entry"
                            description="Bring steps, exercise, and active calories into Calibrate while keeping your food budget grounded in your profile target."
                        />
                        <HealthConnectOnboardingStep />
                    </>
                );
            case 'watch':
                return (
                    <>
                        <ConnectionStepIntro
                            icon="watch-outline"
                            title="Your calorie budget at a glance"
                            description="Pair now to see calories consumed, calories remaining, and goal progress on your watch. Food and weight entry stay focused on your phone."
                        />
                        <WearPairingCard embedded />
                        <AppText variant="muted">
                            This step is optional. Continue now and pair later from Settings if your watch is not nearby.
                        </AppText>
                    </>
                );
            case 'review':
                return (
                    <>
                        <ReviewRow label="Goal" value={`${currentWeight || '-'} -> ${resolvedTargetWeight || '-'} ${formatWeightUnit(weightUnit)}`} />
                        <ReviewRow
                            label="Calorie change"
                            value={formatDailyGoalChange(signedDailyDeficit)}
                        />
                        <ReviewRow label="Date of birth" value={dateOfBirth || '-'} />
                        <ReviewRow label="Sex" value={SEX_OPTIONS.find((option) => option.value === sex)?.label ?? '-'} />
                        <ReviewRow label="Activity" value={ACTIVITY_OPTIONS.find((option) => option.value === activityLevel)?.label ?? '-'} />
                        <ReviewRow
                            label="Height"
                            value={heightUnit === HEIGHT_UNITS.CM ? `${heightCm || '-'} cm` : `${heightFeet || '-'} ft ${heightInches || '0'} in`}
                        />
                        <ReviewRow label="Time zone" value={timezone ? formatTimeZoneLabel(timezone) : '-'} />
                    </>
                );
        }
    }

    const navigationPending = saveDraftMutation.isPending
        || completionMutation.isPending
        || hasQueuedCompletion
        || isFinishing;
    const paceBlocked = activeStep.key === 'pace' && (
        planOptionsQuery.isPending ||
        planOptionsQuery.isError ||
        !hasExplicitDailyChange ||
        planOptionsQuery.data?.eligibility.status !== 'eligible' ||
        selectedPlanOption?.available !== true
    );
    let primaryActionTitle = activeStep.key === 'review' && !setupSaved
        ? 'Complete setup'
        : getNextButtonTitle(nextStep?.key);
    if (saveDraftMutation.isPending) {
        primaryActionTitle = 'Saving progress...';
    } else if (completionMutation.isPending) {
        primaryActionTitle = 'Completing setup...';
    } else if (hasQueuedCompletion) {
        primaryActionTitle = 'Waiting for connection...';
    } else if (isFinishing) {
        primaryActionTitle = 'Finishing...';
    } else if (draftSaveFailed) {
        primaryActionTitle = 'Retry save';
    }

    return (
        <Screen
            testID="onboarding-root"
            scroll={false}
            safeTop
            style={[styles.screen, { backgroundColor: themeColors.background }]}
        >
            {(draftResourceState.kind === ASYNC_RESOURCE_STATES.STALE
                || draftResourceState.kind === ASYNC_RESOURCE_STATES.DEGRADED) && (
                <AsyncStateBoundary
                    state={draftResourceState}
                    resourceLabel="your saved setup"
                    loading={null}
                    empty={null}
                    onRetry={isOnline ? refetchOnboardingDraft : undefined}
                >
                    {null}
                </AsyncStateBoundary>
            )}
            <View style={styles.setupHeader}>
                <CalibrateLogo size={30} />
                <View style={styles.setupHeaderCopy}>
                    <AppText variant="label" style={{ color: themeColors.primary }}>Calibrate setup</AppText>
                    <AppText accessibilityRole="header" aria-level={1} variant="subtitle">
                        Build your daily target
                    </AppText>
                </View>
            </View>

            <OnboardingProgress
                steps={onboardingSteps}
                activeIndex={activeStepIndex}
            />

            <KeyboardAvoidingView
                behavior={getKeyboardAvoidingBehavior(Platform.OS)}
                style={styles.wizardRegion}
            >
                <KeyboardAwareScrollView
                    contentContainerStyle={styles.wizardContent}
                    showsVerticalScrollIndicator={false}
                >
                    <AppCard>
                        <SectionHeader title={activeStep.title} description={activeStep.description} />
                        {renderStepContent()}
                    </AppCard>
                </KeyboardAwareScrollView>

                <View style={[styles.actionBar, { borderTopColor: themeColors.outlineVariant, backgroundColor: themeColors.background }]}>
                    <OnboardingCompletionRecovery
                        mutation={queuedCompletionMutation}
                        status={draftStatus}
                        retrying={isRetryingCompletion}
                        onRetry={handleRetryCompletion}
                    />
                    {validationError && (
                        <AppText accessibilityRole="alert" style={{ color: themeColors.danger }}>
                            {validationError}
                        </AppText>
                    )}
                    <View style={[styles.actions, fontScale >= 1.5 && styles.actionsLargeText]}>
                        <AppButton
                            title="Back"
                            variant="secondary"
                            disabled={activeStepIndex <= minimumSelectableStepIndex || navigationPending}
                            leftIcon={<Ionicons name="chevron-back" size={18} color={themeColors.onSurface} />}
                            onPress={handleBack}
                            style={styles.actionButton}
                        />
                        <AppButton
                            testID={activeStep.key === 'review' ? 'onboarding-complete' : 'onboarding-continue'}
                            title={primaryActionTitle}
                            disabled={(activeStep.key === 'review' && !canSubmit) || paceBlocked || navigationPending}
                            leftIcon={<Ionicons name={!nextStep ? 'checkmark' : 'chevron-forward'} size={18} color={themeColors.onPrimary} />}
                            onPress={() => void handleNext()}
                            style={styles.actionButton}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const ConnectionStepIntro: React.FC<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    description: string;
}> = ({ icon, title, description }) => {
    const { colors: themeColors } = useAppTheme();
    return (
        <View
            style={[
                styles.connectionIntro,
                {
                    backgroundColor: themeColors.primaryContainer,
                    borderColor: themeColors.outlineVariant
                }
            ]}
        >
            <View style={[styles.connectionIcon, { backgroundColor: themeColors.surface }]}>
                <Ionicons name={icon} size={26} color={themeColors.primary} />
            </View>
            <View style={styles.connectionCopy}>
                <AppText variant="label" style={{ color: themeColors.onPrimaryContainer }}>Optional connection</AppText>
                <AppText variant="subtitle" style={{ color: themeColors.onPrimaryContainer }}>{title}</AppText>
                <AppText style={{ color: themeColors.onPrimaryContainer }}>{description}</AppText>
            </View>
        </View>
    );
};

const PlanSummary: React.FC<{
    currentWeight: string;
    targetWeight: string;
    unit: string;
    signedDailyDeficit: number;
}> = ({ currentWeight, targetWeight, unit, signedDailyDeficit }) => {
    const { colors: themeColors } = useAppTheme();
    return (
        <View style={[styles.summaryPanel, { backgroundColor: themeColors.surfaceContainer }]}>
            <ReviewRow label="Start" value={`${currentWeight || '-'} ${unit}`} compact />
            <ReviewRow label="Target" value={`${targetWeight || '-'} ${unit}`} compact />
            <ReviewRow
                label="Plan"
                value={formatDailyGoalChange(signedDailyDeficit)}
                compact
            />
        </View>
    );
};

const ReviewRow: React.FC<{ label: string; value: string; compact?: boolean }> = ({ label, value, compact = false }) => {
    const { colors: themeColors } = useAppTheme();
    return (
        <View style={[styles.reviewRow, { borderBottomColor: themeColors.outlineVariant }, compact && styles.reviewRowCompact]}>
            <AppText variant="muted">{label}</AppText>
            <AppText style={styles.reviewValue}>{value}</AppText>
        </View>
    );
};

const styles = StyleSheet.create({
    profileGate: {
        flex: 1,
        justifyContent: 'center',
        maxWidth: ONBOARDING_CONTENT_MAX_WIDTH
    },
    screen: {
        flex: 1,
        width: '100%',
        maxWidth: ONBOARDING_CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        gap: spacing.md
    },
    setupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    setupHeaderCopy: {
        flex: 1,
        gap: spacing.xs
    },
    wizardRegion: {
        flex: 1,
        minHeight: 0
    },
    wizardContent: {
        paddingBottom: spacing.md
    },
    actionBar: {
        gap: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: spacing.md
    },
    connectionIntro: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth
    },
    connectionIcon: {
        width: 48,
        height: 48,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill
    },
    connectionCopy: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    fieldStack: {
        gap: spacing.md
    },
    infoPanel: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        borderRadius: radius.md,
        padding: spacing.md
    },
    infoText: {
        flex: 1,
        lineHeight: 20
    },
    summaryPanel: {
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm
    },
    reviewRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: spacing.sm
    },
    reviewRowCompact: {
        borderBottomWidth: 0,
        paddingVertical: spacing.xs
    },
    reviewValue: {
        flex: 1,
        textAlign: 'right',
        fontWeight: '800',
        flexWrap: 'wrap'
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionsLargeText: {
        flexDirection: 'column'
    },
    actionButton: {
        flex: 1
    }
});
