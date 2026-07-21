import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppChip } from '../src/components/AppChip';
import { AppText } from '../src/components/AppText';
import { CalibrateLogo } from '../src/components/CalibrateLogo';
import { DatePickerField } from '../src/components/DatePickerField';
import { HealthConnectOnboardingStep } from '../src/components/HealthConnectOnboardingStep';
import { LoadingState } from '../src/components/LoadingState';
import { NumberStepperField } from '../src/components/NumberStepperField';
import { GoalDailyChangeSelect } from '../src/components/GoalDailyChangeSelect';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { TimeZonePickerField } from '../src/components/TimeZonePickerField';
import { WearPairingCard } from '../src/components/WearPairingCard';
import { useAuth } from '../src/auth/AuthContext';
import { gramsToDisplayWeight, millimetersToCentimeters, millimetersToFeetInches } from '../src/utils/bodyMeasurements';
import { getTodayDate } from '../src/utils/dates';
import { formatWeightUnit } from '../src/utils/format';
import {
    DAILY_GOAL_CHANGE_OPTIONS,
    formatDailyGoalChange,
    getSignedDailyDeficit,
    GOAL_MODE_OPTIONS,
    type GoalMode
} from '../src/utils/goals';
import { isProfileSetupComplete } from '../src/utils/profileCompletion';
import { ACTIVITY_OPTIONS, HEIGHT_UNIT_OPTIONS, SEX_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../src/utils/profileOptions';
import { getKeyboardAvoidingBehavior } from '../src/utils/keyboard';
import { detectDeviceTimeZone, formatTimeZoneLabel, resolveOnboardingTimeZone } from '../src/utils/timezones';
import {
    getNextButtonTitle,
    getOnboardingSteps,
    isOptionalConnectionStep,
    type OnboardingStepKey
} from '../src/onboarding/steps';
import { OnboardingProgress } from '../src/onboarding/OnboardingProgress';
import { radius, spacing, useAppTheme } from '../src/theme';
import { WEIGHT_INPUT_INCREMENT } from '../src/config/inputPrecision';

function getTargetWeightForGoal(goalMode: GoalMode, currentWeight: string, targetWeight: string): string {
    if (goalMode === 'maintain' && targetWeight.trim().length === 0) {
        return currentWeight;
    }
    return targetWeight;
}

function validateGoal(goalMode: GoalMode, currentWeight: number, targetWeight: number): string | null {
    if (!Number.isFinite(currentWeight) || currentWeight <= 0 || !Number.isFinite(targetWeight) || targetWeight <= 0) {
        return 'Enter a valid current and target weight.';
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
    const { api, user, updateCurrentUser } = useAuth();
    const queryClient = useQueryClient();
    const profileQuery = useQuery({
        queryKey: ['mobile-profile'],
        queryFn: () => api.getUserProfile(),
        enabled: Boolean(user)
    });
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
    const [setupSaved, setSetupSaved] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
    const optionalStartIndex = onboardingSteps.findIndex(({ key }) => isOptionalConnectionStep(key));
    const minimumSelectableStepIndex = setupSaved && optionalStartIndex >= 0 ? optionalStartIndex : 0;

    const signedDailyDeficit = getSignedDailyDeficit(goalMode, dailyChangeAbs);
    const resolvedTargetWeight = getTargetWeightForGoal(goalMode, currentWeight, targetWeight);
    const canSubmit = currentWeight.trim().length > 0 &&
        resolvedTargetWeight.trim().length > 0 &&
        timezone.trim().length > 0 &&
        dateOfBirth.trim().length > 0 &&
        Boolean(sex) &&
        Boolean(activityLevel) &&
        (heightUnit === HEIGHT_UNITS.CM ? heightCm.trim().length > 0 : heightFeet.trim().length > 0);

    useEffect(() => {
        if (!profileQuery.data) return;

        setWeightUnit(user?.weight_unit ?? WEIGHT_UNITS.KG);
        setHeightUnit(user?.height_unit ?? HEIGHT_UNITS.CM);
        const profile = profileQuery.data.profile;
        const profileHasStarted = Boolean(
            profile.date_of_birth ||
            profile.sex ||
            profile.height_mm ||
            profile.activity_level ||
            profileQuery.data.goal_daily_deficit !== null
        );
        setTimezone(resolveOnboardingTimeZone(profile.timezone, deviceTimeZone, profileHasStarted));
        setDateOfBirth(profileQuery.data.profile.date_of_birth?.slice(0, 10) ?? '');
        setSex(profileQuery.data.profile.sex);
        setActivityLevel(profileQuery.data.profile.activity_level ?? ACTIVITY_LEVELS.LIGHT);
        setCurrentWeight(gramsToDisplayWeight(profileQuery.data.latest_weight_grams, user?.weight_unit ?? WEIGHT_UNITS.KG));
        setHeightCm(millimetersToCentimeters(profileQuery.data.profile.height_mm));
        const imperialHeight = millimetersToFeetInches(profileQuery.data.profile.height_mm);
        setHeightFeet(imperialHeight.feet);
        setHeightInches(imperialHeight.inches);
    }, [deviceTimeZone, profileQuery.data, user?.height_unit, user?.weight_unit]);

    const setupMutation = useMutation({
        mutationFn: async () => {
            const parsedCurrentWeight = Number(currentWeight);
            const parsedTargetWeight = Number(resolvedTargetWeight);
            const goalError = validateGoal(goalMode, parsedCurrentWeight, parsedTargetWeight);
            if (goalError) {
                throw new Error(goalError);
            }

            if (!sex || !activityLevel) {
                throw new Error('Complete sex and activity level.');
            }

            const resolvedTimezone = timezone.trim() || 'UTC';
            await api.updatePreferences({ weight_unit: weightUnit, height_unit: heightUnit });
            const profileResponse = await api.updateProfile({
                timezone: resolvedTimezone,
                date_of_birth: dateOfBirth,
                sex,
                activity_level: activityLevel,
                ...(heightUnit === HEIGHT_UNITS.CM
                    ? { height_cm: heightCm }
                    : { height_feet: heightFeet, height_inches: heightInches || '0' })
            });
            await api.addMetric({
                date: getTodayDate(resolvedTimezone),
                weight: parsedCurrentWeight
            });
            await api.createGoal({
                start_weight: parsedCurrentWeight,
                target_weight: parsedTargetWeight,
                daily_deficit: signedDailyDeficit
            });
            return profileResponse;
        },
        onSuccess: async (response) => {
            setValidationError(null);
            updateCurrentUser(response.user);
            if (nextStep && isOptionalConnectionStep(nextStep.key)) {
                setSetupSaved(true);
                setActiveStepIndex((current) => Math.min(current + 1, onboardingSteps.length - 1));
                return;
            }
            await finishOnboarding();
        },
        onError: (error) => {
            setValidationError(error instanceof Error ? error.message : 'Unable to finish setup.');
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

    const projectedTarget = useMemo(() => {
        const current = Number(currentWeight);
        if (!Number.isFinite(current) || signedDailyDeficit === 0) return null;
        return formatDailyGoalChange(signedDailyDeficit);
    }, [currentWeight, signedDailyDeficit]);

    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }

    if (profileQuery.isLoading) {
        return <LoadingState label="Preparing setup..." />;
    }

    if (!setupSaved && profileQuery.isSuccess && isProfileSetupComplete(profileQuery.data)) {
        return <Redirect href="/(tabs)/today" />;
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
                return validateGoal(goalMode, Number(currentWeight), Number(resolvedTargetWeight));
            case 'pace':
                if (goalMode !== 'maintain' && !DAILY_GOAL_CHANGE_OPTIONS.some((value) => String(value) === dailyChangeAbs)) {
                    return 'Choose a daily calorie change.';
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

    function handleNext() {
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
                setupMutation.mutate();
            }
            return;
        }

        if (!nextStep) {
            void finishOnboarding();
            return;
        }

        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.min(current + 1, onboardingSteps.length - 1));
    }

    function handleBack() {
        setValidationError(null);
        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.max(current - 1, minimumSelectableStepIndex));
    }

    async function finishOnboarding() {
        if (isFinishing) return;
        setIsFinishing(true);
        setValidationError(null);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-goal'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] })
            ]);
            router.replace('/(tabs)/today');
        } catch (error) {
            setValidationError(error instanceof Error ? error.message : 'Unable to finish setup.');
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
                                min={WEIGHT_INPUT_INCREMENT}
                                suffix={formatWeightUnit(weightUnit)}
                            />
                            <NumberStepperField
                                label={goalMode === 'maintain' ? 'Maintain at' : 'Target'}
                                value={resolvedTargetWeight}
                                onChangeText={setTargetWeight}
                                step={WEIGHT_INPUT_INCREMENT}
                                min={WEIGHT_INPUT_INCREMENT}
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
                                />
                                {projectedTarget && <AppText variant="muted">Plan pace: {projectedTarget}.</AppText>}
                            </>
                        )}
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
                    <>
                        <DatePickerField
                            label="Date of birth"
                            value={dateOfBirth}
                            onChangeDate={setDateOfBirth}
                            maximumDate={getTodayDate(timezone)}
                            fallbackDate="1990-01-01"
                        />
                        <AppText variant="label">Sex</AppText>
                        <View style={styles.chips}>
                            {SEX_OPTIONS.map((option) => (
                                <AppChip
                                    key={option.value}
                                    label={option.label}
                                    selected={sex === option.value}
                                    onPress={() => setSex(option.value)}
                                />
                            ))}
                        </View>
                    </>
                );
            case 'burn':
                return (
                    <>
                        <AppText variant="label">Activity level</AppText>
                        <View style={styles.chips}>
                            {ACTIVITY_OPTIONS.map((option) => (
                                <AppChip
                                    key={option.value}
                                    label={option.label}
                                    selected={activityLevel === option.value}
                                    onPress={() => setActivityLevel(option.value)}
                                />
                            ))}
                        </View>
                        <AppText variant="label">Height unit</AppText>
                        <SegmentedControl options={HEIGHT_UNIT_OPTIONS} value={heightUnit} onChange={setHeightUnit} />
                        {heightUnit === HEIGHT_UNITS.CM ? (
                            <NumberStepperField label="Height" value={heightCm} onChangeText={setHeightCm} step={1} min={0} suffix="cm" />
                        ) : (
                            <View style={styles.fieldStack}>
                                <NumberStepperField
                                    label="Feet"
                                    value={heightFeet}
                                    onChangeText={setHeightFeet}
                                    step={1}
                                    min={0}
                                />
                                <NumberStepperField
                                    label="Inches"
                                    value={heightInches}
                                    onChangeText={setHeightInches}
                                    step={1}
                                    min={0}
                                    max={11}
                                />
                            </View>
                        )}
                        <TimeZonePickerField value={timezone} onChange={setTimezone} />
                    </>
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
                            <AppText variant="muted">
                                Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                            </AppText>
                        )}
                        {importMutation.error && <AppText style={{ color: themeColors.danger }}>{importMutation.error.message}</AppText>}
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

    const navigationPending = setupMutation.isPending || isFinishing;
    let primaryActionTitle = getNextButtonTitle(nextStep?.key);
    if (setupMutation.isPending) {
        primaryActionTitle = 'Saving...';
    } else if (isFinishing) {
        primaryActionTitle = 'Finishing...';
    }

    return (
        <Screen scroll={false} safeTop style={[styles.screen, { backgroundColor: themeColors.background }]}>
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
                <ScrollView
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    contentContainerStyle={styles.wizardContent}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <AppCard>
                        <SectionHeader title={activeStep.title} description={activeStep.description} />
                        {renderStepContent()}
                    </AppCard>
                </ScrollView>

                <View style={[styles.actionBar, { borderTopColor: themeColors.outlineVariant, backgroundColor: themeColors.background }]}>
                    {(validationError || setupMutation.error) && (
                        <AppText accessibilityRole="alert" style={{ color: themeColors.danger }}>
                            {validationError ?? setupMutation.error?.message}
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
                            title={primaryActionTitle}
                            disabled={(activeStep.key === 'review' && !canSubmit) || navigationPending}
                            leftIcon={<Ionicons name={!nextStep ? 'checkmark' : 'chevron-forward'} size={18} color={themeColors.onPrimary} />}
                            onPress={handleNext}
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
    screen: {
        flex: 1,
        width: '100%',
        maxWidth: 760,
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
