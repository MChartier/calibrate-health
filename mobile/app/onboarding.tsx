import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { colors, spacing } from '../src/theme';

type GoalMode = 'lose' | 'maintain' | 'gain';

const GOAL_MODES: Array<{ value: GoalMode; label: string }> = [
    { value: 'lose', label: 'Lose' },
    { value: 'maintain', label: 'Maintain' },
    { value: 'gain', label: 'Gain' }
];

const DAILY_CHANGE_OPTIONS = ALLOWED_DAILY_DEFICIT_ABS_VALUES.filter((value) => value !== 0);
const WEIGHT_ENTRY_STEP = 0.1; // Keep setup weights aligned with the log-weight dialog.

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
    const { api, user, updateCurrentUser } = useAuth();
    const queryClient = useQueryClient();
    const profileQuery = useQuery({
        queryKey: ['mobile-profile'],
        queryFn: () => api.getUserProfile(),
        enabled: Boolean(user)
    });
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(user?.weight_unit ?? WEIGHT_UNITS.KG);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(user?.height_unit ?? HEIGHT_UNITS.CM);
    const [timezone, setTimezone] = useState(user?.timezone ?? getDetectedTimezone());
    const [currentWeight, setCurrentWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [goalMode, setGoalMode] = useState<GoalMode>('lose');
    const [dailyChangeAbs, setDailyChangeAbs] = useState('500');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [sex, setSex] = useState<(typeof SEX_OPTIONS)[number]['value'] | null>(null);
    const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(ACTIVITY_LEVELS.LIGHT);
    const [heightCm, setHeightCm] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    const signedDailyDeficit = getSignedDailyDeficit(goalMode, dailyChangeAbs);
    const canSubmit = currentWeight.trim().length > 0 &&
        targetWeight.trim().length > 0 &&
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
            const parsedTargetWeight = Number(targetWeight);
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

    function handleFinish() {
        setValidationError(null);
        setupMutation.mutate();
    }

    return (
        <Screen>
            <SectionHeader
                title="Set up calibrate"
                description="Add the goal and body details required for calorie targets."
            />

            <View style={styles.stepRow}>
                <AppChip label="Goal" selected />
                <AppChip label="Calorie burn" selected />
                <AppChip label="Import" />
            </View>

            <AppCard>
                <SectionHeader title="Goal" description={`Weights are entered in ${formatWeightUnit(weightUnit)}.`} />
                <SegmentedControl options={GOAL_MODES} value={goalMode} onChange={setGoalMode} />
                <View style={styles.row}>
                    <NumberStepperField
                        label="Current"
                        value={currentWeight}
                        onChangeText={setCurrentWeight}
                        step={WEIGHT_ENTRY_STEP}
                        min={WEIGHT_ENTRY_STEP}
                        suffix={formatWeightUnit(weightUnit)}
                        containerStyle={styles.rowButton}
                    />
                    <NumberStepperField
                        label="Target"
                        value={targetWeight}
                        onChangeText={setTargetWeight}
                        step={WEIGHT_ENTRY_STEP}
                        min={WEIGHT_ENTRY_STEP}
                        suffix={formatWeightUnit(weightUnit)}
                        containerStyle={styles.rowButton}
                    />
                </View>
                {goalMode !== 'maintain' && (
                    <>
                        <AppText variant="label">Daily calorie change</AppText>
                        <View style={styles.chips}>
                            {DAILY_CHANGE_OPTIONS.map((value) => (
                                <AppChip
                                    key={value}
                                    label={`${goalMode === 'gain' ? '+' : '-'}${value}`}
                                    selected={dailyChangeAbs === String(value)}
                                    onPress={() => setDailyChangeAbs(String(value))}
                                />
                            ))}
                        </View>
                    </>
                )}
                {projectedTarget && <AppText variant="muted">Plan pace: {projectedTarget}.</AppText>}
            </AppCard>

            <AppCard>
                <SectionHeader title="Calorie burn" description="These fields power BMR, TDEE, and daily targets." />
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
                        <AppChip key={option.value} label={option.label} selected={sex === option.value} onPress={() => setSex(option.value)} />
                    ))}
                </View>
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
                    <View style={styles.row}>
                        <NumberStepperField label="Feet" value={heightFeet} onChangeText={setHeightFeet} step={1} min={0} containerStyle={styles.rowButton} />
                        <NumberStepperField label="Inches" value={heightInches} onChangeText={setHeightInches} step={1} min={0} max={11} containerStyle={styles.rowButton} />
                    </View>
                )}
                <TextField label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
            </AppCard>

            <AppCard>
                <SectionHeader title="Units" description="Choose the units the native app should use." />
                <AppText variant="label">Weight unit</AppText>
                <SegmentedControl options={WEIGHT_UNIT_OPTIONS} value={weightUnit} onChange={setWeightUnit} />
            </AppCard>

            <AppCard>
                <SectionHeader title="Optional import" description="Bring in Lose It food logs and weights now or later from Account." />
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
            </AppCard>

            {(validationError || setupMutation.error) && (
                <AppText style={styles.error}>{validationError ?? setupMutation.error?.message}</AppText>
            )}
            <AppButton
                title={setupMutation.isPending ? 'Finishing setup...' : 'Finish setup'}
                disabled={!canSubmit || setupMutation.isPending}
                leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                onPress={handleFinish}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    stepRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
