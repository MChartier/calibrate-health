import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
    ACTIVITY_LEVELS,
    ALLOWED_DAILY_DEFICIT_ABS_VALUES,
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
import { DatePickerField } from '../src/components/DatePickerField';
import { LoadingState } from '../src/components/LoadingState';
import { NumberStepperField } from '../src/components/NumberStepperField';
import { OverlaySelect, type OverlaySelectOption } from '../src/components/OverlaySelect';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { TextField } from '../src/components/TextField';
import { useAuth } from '../src/auth/AuthContext';
import { gramsToDisplayWeight, millimetersToCentimeters, millimetersToFeetInches } from '../src/utils/bodyMeasurements';
import { getTodayDate } from '../src/utils/dates';
import { formatCalories, formatWeightUnit } from '../src/utils/format';
import { isProfileSetupComplete } from '../src/utils/profileCompletion';
import { ACTIVITY_OPTIONS, HEIGHT_UNIT_OPTIONS, SEX_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../src/utils/profileOptions';
import { colors, radius, spacing } from '../src/theme';

type GoalMode = 'lose' | 'maintain' | 'gain';
type OnboardingStepKey = 'goal' | 'pace' | 'about' | 'burn' | 'import' | 'review';

const GOAL_MODES: Array<{ value: GoalMode; label: string }> = [
    { value: 'lose', label: 'Lose' },
    { value: 'maintain', label: 'Maintain' },
    { value: 'gain', label: 'Gain' }
];

const ONBOARDING_STEPS: Array<{ key: OnboardingStepKey; label: string; title: string; description: string }> = [
    {
        key: 'goal',
        label: 'Goal',
        title: 'Choose your weight goal',
        description: 'Start with where you are today and where you want to go.'
    },
    {
        key: 'pace',
        label: 'Pace',
        title: 'Set a sustainable pace',
        description: 'This controls the calorie target we calculate each day.'
    },
    {
        key: 'about',
        label: 'About',
        title: 'Tell us the basics',
        description: 'Age and sex help estimate baseline calorie burn.'
    },
    {
        key: 'burn',
        label: 'Burn',
        title: 'Estimate calorie burn',
        description: 'Height, activity, and timezone keep daily targets accurate.'
    },
    {
        key: 'import',
        label: 'Import',
        title: 'Bring in history',
        description: 'Optional. Import Lose It data now or do it later from Account.'
    },
    {
        key: 'review',
        label: 'Review',
        title: 'Review your setup',
        description: 'Confirm the details used for your initial calorie target.'
    }
];

const DAILY_CHANGE_OPTIONS = ALLOWED_DAILY_DEFICIT_ABS_VALUES.filter((value) => value !== 0);
const WEIGHT_ENTRY_STEP = 0.1; // Keep setup weights aligned with the log-weight dialog.
const ONBOARDING_CARD_MIN_HEIGHT = 430; // Keeps the wizard card steady as users move between setup steps.

function getDetectedTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

function getSignedDailyDeficit(goalMode: GoalMode, dailyChangeAbs: string): number {
    if (goalMode === 'maintain') return 0;
    const magnitude = Math.abs(Number(dailyChangeAbs));
    return goalMode === 'gain' ? -magnitude : magnitude;
}

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

function getDailyChangeCopy(goalMode: Exclude<GoalMode, 'maintain'>, value: string): { label: string; description: string } {
    const magnitude = Math.abs(Number(value));
    const formatted = Number.isFinite(magnitude) ? magnitude.toLocaleString() : value;
    if (goalMode === 'gain') {
        return {
            label: `${formatted} kcal/day surplus`,
            description: `Targets eating ${formatted} kcal above estimated burn.`
        };
    }
    return {
        label: `${formatted} kcal/day deficit`,
        description: `Targets eating ${formatted} kcal below estimated burn.`
    };
}

function formatDailyChangeSummary(signedDailyDeficit: number): string {
    if (signedDailyDeficit === 0) return 'Maintenance';
    const direction = signedDailyDeficit > 0 ? 'deficit' : 'surplus';
    return `${formatCalories(Math.abs(signedDailyDeficit))}/day ${direction}`;
}

function getNextButtonTitle(step: OnboardingStepKey): string {
    switch (step) {
        case 'goal':
            return 'Next: Pace';
        case 'pace':
            return 'Next: About you';
        case 'about':
            return 'Next: Calorie burn';
        case 'burn':
            return 'Next: Import';
        case 'import':
            return 'Review setup';
        case 'review':
            return 'Finish setup';
    }
}

export default function OnboardingScreen() {
    const { api, user, updateCurrentUser } = useAuth();
    const queryClient = useQueryClient();
    const profileQuery = useQuery({
        queryKey: ['mobile-profile'],
        queryFn: () => api.getUserProfile(),
        enabled: Boolean(user)
    });
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const activeStep = ONBOARDING_STEPS[activeStepIndex];
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(user?.weight_unit ?? WEIGHT_UNITS.KG);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(user?.height_unit ?? HEIGHT_UNITS.CM);
    const [timezone, setTimezone] = useState(user?.timezone ?? getDetectedTimezone());
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
        setTimezone(profileQuery.data.profile.timezone || getDetectedTimezone());
        setDateOfBirth(profileQuery.data.profile.date_of_birth?.slice(0, 10) ?? '');
        setSex(profileQuery.data.profile.sex);
        setActivityLevel(profileQuery.data.profile.activity_level ?? ACTIVITY_LEVELS.LIGHT);
        setCurrentWeight(gramsToDisplayWeight(profileQuery.data.latest_weight_grams, user?.weight_unit ?? WEIGHT_UNITS.KG));
        setHeightCm(millimetersToCentimeters(profileQuery.data.profile.height_mm));
        const imperialHeight = millimetersToFeetInches(profileQuery.data.profile.height_mm);
        setHeightFeet(imperialHeight.feet);
        setHeightInches(imperialHeight.inches);
    }, [profileQuery.data, user?.height_unit, user?.weight_unit]);

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
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-goal'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] })
            ]);
            router.replace('/(tabs)/today');
        },
        onError: (error) => {
            setValidationError(error instanceof Error ? error.message : 'Unable to finish setup.');
        }
    });

    const importMutation = useMutation({
        mutationFn: async () => {
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
        const direction = signedDailyDeficit > 0 ? 'deficit' : 'surplus';
        return `${formatCalories(Math.abs(signedDailyDeficit))}/day ${direction}`;
    }, [currentWeight, signedDailyDeficit]);

    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }

    if (profileQuery.isLoading) {
        return <LoadingState label="Preparing setup..." />;
    }

    if (profileQuery.isSuccess && isProfileSetupComplete(profileQuery.data)) {
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
                if (goalMode !== 'maintain' && !DAILY_CHANGE_OPTIONS.some((value) => String(value) === dailyChangeAbs)) {
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
            setupMutation.mutate();
            return;
        }

        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1));
    }

    function handleBack() {
        setValidationError(null);
        setIsDailyChangeSelectorOpen(false);
        setActiveStepIndex((current) => Math.max(current - 1, 0));
    }

    function renderStepContent() {
        switch (activeStep.key) {
            case 'goal':
                return (
                    <>
                        <SegmentedControl options={GOAL_MODES} value={goalMode} onChange={handleGoalModeChange} />
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
                                step={WEIGHT_ENTRY_STEP}
                                min={WEIGHT_ENTRY_STEP}
                                suffix={formatWeightUnit(weightUnit)}
                            />
                            <NumberStepperField
                                label={goalMode === 'maintain' ? 'Maintain at' : 'Target'}
                                value={resolvedTargetWeight}
                                onChangeText={setTargetWeight}
                                step={WEIGHT_ENTRY_STEP}
                                min={WEIGHT_ENTRY_STEP}
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
                            <View style={styles.infoPanel}>
                                <Ionicons name="remove-circle-outline" size={18} color={colors.primaryDark} />
                                <AppText style={styles.infoText}>
                                    Maintenance uses a steady calorie target with no planned deficit or surplus.
                                </AppText>
                            </View>
                        ) : (
                            <>
                                <AppText variant="label">Daily calorie change</AppText>
                                <DailyChangeSelector
                                    goalMode={goalMode}
                                    value={dailyChangeAbs}
                                    isOpen={isDailyChangeSelectorOpen}
                                    onToggle={() => setIsDailyChangeSelectorOpen((current) => !current)}
                                    onSelect={(value) => {
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
                        <TextField label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
                    </>
                );
            case 'import':
                return (
                    <>
                        <View style={styles.infoPanel}>
                            <Ionicons name="cloud-upload-outline" size={18} color={colors.primaryDark} />
                            <AppText style={styles.infoText}>
                                Importing is optional. You can start fresh now and import later from Account.
                            </AppText>
                        </View>
                        {importMutation.data && (
                            <AppText variant="muted">
                                Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                            </AppText>
                        )}
                        {importMutation.error && <AppText style={styles.error}>{importMutation.error.message}</AppText>}
                        <AppButton
                            title={importMutation.isPending ? 'Importing...' : 'Import Lose It ZIP'}
                            variant="secondary"
                            leftIcon={<Ionicons name="cloud-upload-outline" size={18} color={colors.text} />}
                            onPress={() => importMutation.mutate()}
                        />
                    </>
                );
            case 'review':
                return (
                    <>
                        <ReviewRow label="Goal" value={`${currentWeight || '-'} -> ${resolvedTargetWeight || '-'} ${formatWeightUnit(weightUnit)}`} />
                        <ReviewRow
                            label="Calorie change"
                            value={formatDailyChangeSummary(signedDailyDeficit)}
                        />
                        <ReviewRow label="Date of birth" value={dateOfBirth || '-'} />
                        <ReviewRow label="Sex" value={SEX_OPTIONS.find((option) => option.value === sex)?.label ?? '-'} />
                        <ReviewRow label="Activity" value={ACTIVITY_OPTIONS.find((option) => option.value === activityLevel)?.label ?? '-'} />
                        <ReviewRow
                            label="Height"
                            value={heightUnit === HEIGHT_UNITS.CM ? `${heightCm || '-'} cm` : `${heightFeet || '-'} ft ${heightInches || '0'} in`}
                        />
                        <ReviewRow label="Timezone" value={timezone || '-'} />
                    </>
                );
        }
    }

    return (
        <Screen>
            <SectionHeader
                title="Set up calibrate"
                description="Answer a few focused questions to calculate your first daily target."
            />

            <OnboardingProgress activeIndex={activeStepIndex} onSelectStep={setActiveStepIndex} />

            <AppCard style={styles.wizardCard}>
                <SectionHeader title={activeStep.title} eyebrow={`${activeStepIndex + 1} of ${ONBOARDING_STEPS.length}`} description={activeStep.description} />
                {renderStepContent()}
            </AppCard>

            {(validationError || setupMutation.error) && (
                <AppText style={styles.error}>{validationError ?? setupMutation.error?.message}</AppText>
            )}

            <View style={styles.actions}>
                <AppButton
                    title="Back"
                    variant="secondary"
                    disabled={activeStepIndex === 0 || setupMutation.isPending}
                    leftIcon={<Ionicons name="chevron-back" size={18} color={colors.text} />}
                    onPress={handleBack}
                    style={styles.actionButton}
                />
                <AppButton
                    title={setupMutation.isPending ? 'Finishing...' : getNextButtonTitle(activeStep.key)}
                    disabled={(activeStep.key === 'review' && !canSubmit) || setupMutation.isPending}
                    leftIcon={<Ionicons name={activeStep.key === 'review' ? 'checkmark' : 'chevron-forward'} size={18} color="#ffffff" />}
                    onPress={handleNext}
                    style={styles.actionButton}
                />
            </View>
        </Screen>
    );
}

type DailyChangeSelectorProps = {
    goalMode: Exclude<GoalMode, 'maintain'>;
    value: string;
    isOpen: boolean;
    onToggle: () => void;
    onSelect: (value: string) => void;
};

const DailyChangeSelector: React.FC<DailyChangeSelectorProps> = ({ goalMode, value, isOpen, onToggle, onSelect }) => {
    const options: Array<OverlaySelectOption<string>> = DAILY_CHANGE_OPTIONS.map((option) => {
        const optionValue = String(option);
        const copy = getDailyChangeCopy(goalMode, optionValue);
        return { value: optionValue, label: copy.label, description: copy.description };
    });

    return (
        <OverlaySelect
            accessibilityLabel="Select daily calorie change"
            value={value}
            options={options}
            isOpen={isOpen}
            onToggle={onToggle}
            onChange={onSelect}
        />
    );
};

const OnboardingProgress: React.FC<{
    activeIndex: number;
    onSelectStep: (index: number) => void;
}> = ({ activeIndex, onSelectStep }) => (
    <View style={styles.progressRoot}>
        {ONBOARDING_STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isComplete = index < activeIndex;
            return (
                <Pressable
                    key={step.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive, disabled: index > activeIndex }}
                    onPress={() => {
                        if (index <= activeIndex) {
                            onSelectStep(index);
                        }
                    }}
                    style={styles.progressItem}
                >
                    <View style={[styles.progressDot, isActive && styles.progressDotActive, isComplete && styles.progressDotComplete]}>
                        {isComplete ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : <AppText style={styles.progressDotText}>{index + 1}</AppText>}
                    </View>
                    <AppText variant="caption" numberOfLines={1} style={isActive && styles.progressLabelActive}>
                        {step.label}
                    </AppText>
                </Pressable>
            );
        })}
    </View>
);

const PlanSummary: React.FC<{
    currentWeight: string;
    targetWeight: string;
    unit: string;
    signedDailyDeficit: number;
}> = ({ currentWeight, targetWeight, unit, signedDailyDeficit }) => (
    <View style={styles.summaryPanel}>
        <ReviewRow label="Start" value={`${currentWeight || '-'} ${unit}`} compact />
        <ReviewRow label="Target" value={`${targetWeight || '-'} ${unit}`} compact />
        <ReviewRow
            label="Plan"
            value={formatDailyChangeSummary(signedDailyDeficit)}
            compact
        />
    </View>
);

const ReviewRow: React.FC<{ label: string; value: string; compact?: boolean }> = ({ label, value, compact = false }) => (
    <View style={[styles.reviewRow, compact && styles.reviewRowCompact]}>
        <AppText variant="muted">{label}</AppText>
        <AppText style={styles.reviewValue} numberOfLines={2}>{value}</AppText>
    </View>
);

const styles = StyleSheet.create({
    wizardCard: {
        minHeight: ONBOARDING_CARD_MIN_HEIGHT
    },
    progressRoot: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.xs
    },
    progressItem: {
        flex: 1,
        alignItems: 'center',
        gap: spacing.xs
    },
    progressDot: {
        width: 26,
        height: 26,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    progressDotActive: {
        backgroundColor: colors.primarySoft,
        borderColor: colors.primary
    },
    progressDotComplete: {
        backgroundColor: colors.primary,
        borderColor: colors.primary
    },
    progressDotText: {
        color: colors.muted,
        fontSize: 11,
        fontWeight: '900'
    },
    progressLabelActive: {
        color: colors.primaryDark,
        fontWeight: '900'
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
        backgroundColor: colors.primarySoft,
        padding: spacing.md
    },
    infoText: {
        flex: 1,
        lineHeight: 20
    },
    summaryPanel: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md,
        gap: spacing.sm
    },
    reviewRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderBottomColor: colors.border,
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
        fontWeight: '800'
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
