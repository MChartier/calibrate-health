import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALLOWED_DAILY_DEFICIT_ABS_VALUES } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppText } from '../../src/components/AppText';
import { BottomSheetModal } from '../../src/components/BottomSheetModal';
import { GoalProgressCard } from '../../src/components/GoalProgressCard';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { OverlaySelect, type OverlaySelectOption } from '../../src/components/OverlaySelect';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { WeightEntrySheet } from '../../src/components/WeightEntrySheet';
import { WeightTrendCard } from '../../src/components/WeightTrendCard';
import { ProgressOverviewCard } from '../../src/components/progress/ProgressOverviewCard';
import { useAuth } from '../../src/auth/AuthContext';
import { gramsToDisplayWeight } from '../../src/utils/bodyMeasurements';
import { getTodayDate } from '../../src/utils/dates';
import { formatWeightUnit } from '../../src/utils/format';
import { colors, radius, spacing, useAppTheme } from '../../src/theme';

type GoalMode = 'lose' | 'maintain' | 'gain';

const GOAL_MODES: Array<{ value: GoalMode; label: string }> = [
    { value: 'lose', label: 'Lose' },
    { value: 'maintain', label: 'Maintain' },
    { value: 'gain', label: 'Gain' }
];

const DAILY_CHANGE_OPTIONS = ALLOWED_DAILY_DEFICIT_ABS_VALUES.filter((value) => value !== 0);
const WEIGHT_GOAL_STEP = 0.1; // Goal weights should match daily weigh-in precision.

function formatWeightInput(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}

function getGoalValidationError(goalMode: GoalMode, startWeight: number, targetWeight: number): string | null {
    if (!Number.isFinite(startWeight) || startWeight <= 0 || !Number.isFinite(targetWeight) || targetWeight <= 0) {
        return 'Enter a valid start and target weight.';
    }

    if (goalMode === 'lose' && targetWeight >= startWeight) {
        return 'For a loss goal, target weight must be below start weight.';
    }

    if (goalMode === 'gain' && targetWeight <= startWeight) {
        return 'For a gain goal, target weight must be above start weight.';
    }

    return null;
}

function getSignedDailyDeficit(goalMode: GoalMode, dailyChangeAbs: string): number {
    if (goalMode === 'maintain') return 0;
    const magnitude = Math.abs(Number(dailyChangeAbs));
    return goalMode === 'gain' ? -magnitude : magnitude;
}

function getDailyChangeCopy(goalMode: GoalMode, dailyChangeAbs: string): { label: string; description: string } {
    const magnitude = Math.abs(Number(dailyChangeAbs));
    const formattedMagnitude = Number.isFinite(magnitude) ? magnitude.toLocaleString() : dailyChangeAbs;

    if (goalMode === 'gain') {
        return {
            label: `${formattedMagnitude} kcal/day surplus`,
            description: `Targets eating ${formattedMagnitude} kcal above estimated burn.`
        };
    }

    return {
        label: `${formattedMagnitude} kcal/day deficit`,
        description: `Targets eating ${formattedMagnitude} kcal below estimated burn.`
    };
}

function inferGoalMode(dailyDeficit?: number | null): GoalMode {
    if (typeof dailyDeficit !== 'number' || dailyDeficit === 0) return 'maintain';
    return dailyDeficit > 0 ? 'lose' : 'gain';
}

export default function ProgressScreen() {
    const { api, user } = useAuth();
    const { colors: themeColors } = useAppTheme();
    const queryClient = useQueryClient();
    const goalQuery = useQuery({ queryKey: ['mobile-goal'], queryFn: () => api.getGoals() });
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });
    const trendSummaryQuery = useQuery({
        queryKey: ['mobile-metrics-trend', 'summary'],
        queryFn: () => api.getTrendMetrics({ range: 'month' })
    });
    const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
    const [isWeightEditorOpen, setIsWeightEditorOpen] = useState(false);
    const [startWeight, setStartWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [goalMode, setGoalMode] = useState<GoalMode>('lose');
    const [dailyChangeAbs, setDailyChangeAbs] = useState('500');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isDailyChangeSelectorOpen, setIsDailyChangeSelectorOpen] = useState(false);

    const signedDailyDeficit = getSignedDailyDeficit(goalMode, dailyChangeAbs);
    const canSave = Number(startWeight) > 0 && Number(targetWeight) > 0 && Number.isFinite(Number(dailyChangeAbs));

    const saveGoal = useMutation({
        mutationFn: () =>
            api.createGoal({
                start_weight: Number(startWeight),
                target_weight: Number(targetWeight),
                daily_deficit: signedDailyDeficit
            }),
        onSuccess: async () => {
            setValidationError(null);
            setIsGoalEditorOpen(false);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-goal'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] })
            ]);
        }
    });

    function handleSave() {
        const error = getGoalValidationError(goalMode, Number(startWeight), Number(targetWeight));
        setValidationError(error);
        if (error) return;
        saveGoal.mutate();
    }

    function getDefaultStartWeight(): string {
        const latestWeight = metricsQuery.data?.[0]?.weight;
        if (typeof latestWeight === 'number' && Number.isFinite(latestWeight)) {
            return formatWeightInput(latestWeight);
        }

        const trendWeight = trendSummaryQuery.data?.metrics[0]?.trend_weight;
        if (typeof trendWeight === 'number' && Number.isFinite(trendWeight)) {
            return formatWeightInput(trendWeight);
        }

        if (profileQuery.data?.latest_weight_grams && user?.weight_unit) {
            return gramsToDisplayWeight(profileQuery.data.latest_weight_grams, user.weight_unit);
        }

        return goalQuery.data ? formatWeightInput(goalQuery.data.start_weight) : '';
    }

    function openGoalEditor() {
        const currentGoal = goalQuery.data;
        setStartWeight(getDefaultStartWeight());
        setTargetWeight(currentGoal ? formatWeightInput(currentGoal.target_weight) : '');
        setGoalMode(inferGoalMode(currentGoal?.daily_deficit));
        setDailyChangeAbs(String(Math.abs(currentGoal?.daily_deficit ?? 500) || 500));
        setValidationError(null);
        setIsDailyChangeSelectorOpen(false);
        setIsGoalEditorOpen(true);
    }

    function handleGoalModeChange(nextMode: GoalMode) {
        setGoalMode(nextMode);
        setIsDailyChangeSelectorOpen(false);
    }

    return (
        <Screen reserveBottomTabs style={{ backgroundColor: themeColors.background }}>
            <ProgressOverviewCard
                latestMetric={metricsQuery.data?.[0]}
                trendMeta={trendSummaryQuery.data?.meta}
                goal={goalQuery.data}
                user={user}
                onLogWeight={() => setIsWeightEditorOpen(true)}
            />

            <WeightTrendCard
                title="Weight trend"
                description="Daily weigh-ins and your smoothed trend over time."
            />

            <GoalProgressCard
                title="Goal projection"
                goal={goalQuery.data}
                latestMetric={metricsQuery.data?.[0]}
                user={user}
                onEditGoal={openGoalEditor}
            />

            <BottomSheetModal visible={isGoalEditorOpen} onRequestClose={() => setIsGoalEditorOpen(false)}>
                <SectionHeader
                    title="Set a new goal"
                    description={`Weights are entered in ${formatWeightUnit(user?.weight_unit)}.`}
                />
                <SegmentedControl options={GOAL_MODES} value={goalMode} onChange={handleGoalModeChange} />
                <View style={styles.goalEditorBody}>
                    <View style={styles.startingContext}>
                        <Ionicons name="scale-outline" size={18} color={colors.primaryDark} />
                        <View style={styles.startingText}>
                            <AppText variant="label">Starting from</AppText>
                            <AppText style={styles.startingValue}>
                                {startWeight ? `${startWeight} ${formatWeightUnit(user?.weight_unit)}` : 'Log a current weight first'}
                            </AppText>
                        </View>
                    </View>
                    <NumberStepperField
                        label="Target"
                        value={targetWeight}
                        onChangeText={setTargetWeight}
                        step={WEIGHT_GOAL_STEP}
                        min={WEIGHT_GOAL_STEP}
                        suffix={formatWeightUnit(user?.weight_unit)}
                    />
                    <View style={styles.dailyChangeSlot}>
                        <AppText variant="label">Daily calorie change</AppText>
                        {goalMode === 'maintain' ? (
                            <View style={styles.maintenanceNote}>
                                <AppText variant="muted">Maintenance goals use a steady calorie target with no daily deficit or surplus.</AppText>
                            </View>
                        ) : (
                            <DailyChangeSelector
                                goalMode={goalMode}
                                value={dailyChangeAbs}
                                isOpen={isDailyChangeSelectorOpen}
                                onToggle={() => setIsDailyChangeSelectorOpen((current) => !current)}
                                onSelect={(nextValue) => {
                                    setDailyChangeAbs(nextValue);
                                    setIsDailyChangeSelectorOpen(false);
                                }}
                            />
                        )}
                    </View>
                </View>
                {(validationError || saveGoal.error) && (
                    <AppText style={styles.error}>{validationError ?? saveGoal.error?.message}</AppText>
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={() => setIsGoalEditorOpen(false)}
                        style={styles.rowField}
                    />
                    <AppButton
                        title={saveGoal.isPending ? 'Saving...' : 'Save goal'}
                        disabled={!canSave || saveGoal.isPending}
                        leftIcon={<Ionicons name="flag-outline" size={18} color="#ffffff" />}
                        onPress={handleSave}
                        style={styles.rowField}
                    />
                </View>
            </BottomSheetModal>

            <WeightEntrySheet
                visible={isWeightEditorOpen}
                date={getTodayDate(user?.timezone)}
                onClose={() => setIsWeightEditorOpen(false)}
            />
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

const DailyChangeSelector: React.FC<DailyChangeSelectorProps> = ({
    goalMode,
    value,
    isOpen,
    onToggle,
    onSelect
}) => {
    const options: Array<OverlaySelectOption<string>> = DAILY_CHANGE_OPTIONS.map((option) => {
        const optionValue = String(option);
        const optionCopy = getDailyChangeCopy(goalMode, optionValue);
        return {
            value: optionValue,
            label: optionCopy.label,
            description: optionCopy.description
        };
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

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowField: {
        flex: 1
    },
    goalEditorBody: {
        minHeight: 254,
        gap: spacing.md
    },
    dailyChangeSlot: {
        minHeight: 98,
        gap: spacing.sm
    },
    maintenanceNote: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md
    },
    startingContext: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.md
    },
    startingText: {
        flex: 1,
        minWidth: 0
    },
    startingValue: {
        color: colors.primaryDark,
        fontWeight: '900'
    },
    error: {
        color: colors.danger
    }
});
