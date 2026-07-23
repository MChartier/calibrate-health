import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppButton } from '../../src/components/AppButton';
import { AppText } from '../../src/components/AppText';
import { BottomSheetModal } from '../../src/components/BottomSheetModal';
import { GoalProgressCard } from '../../src/components/GoalProgressCard';
import { GoalDailyChangeSelect } from '../../src/components/GoalDailyChangeSelect';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { WeightEntrySheet } from '../../src/components/WeightEntrySheet';
import { ProgressOverviewCard } from '../../src/components/progress/ProgressOverviewCard';
import { WeightTrendPreviewCard } from '../../src/components/progress/WeightTrendPreviewCard';
import { useAuth } from '../../src/auth/AuthContext';
import { gramsToDisplayWeight } from '../../src/utils/bodyMeasurements';
import { getTodayDate } from '../../src/utils/dates';
import { formatWeightUnit } from '../../src/utils/format';
import { hasMetricForDate } from '../../src/utils/metrics';
import {
    getGoalModeFromDailyDeficit,
    getSignedDailyDeficit,
    GOAL_MODE_OPTIONS,
    type GoalMode
} from '../../src/utils/goals';
import { radius, spacing, useAppTheme, type AppTheme } from '../../src/theme';
import { WEIGHT_INPUT_INCREMENT } from '../../src/config/inputPrecision';

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

export default function ProgressScreen() {
    const { api, user } = useAuth();
    const theme = useAppTheme();
    const { colors: themeColors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
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
    const today = getTodayDate(user?.timezone);
    const hasWeightToday = hasMetricForDate(metricsQuery.data ?? [], today);

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
        setGoalMode(getGoalModeFromDailyDeficit(currentGoal?.daily_deficit));
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
                user={user}
                hasWeightToday={hasWeightToday}
                onLogWeight={() => setIsWeightEditorOpen(true)}
            />

            <WeightTrendPreviewCard onPress={() => router.push('/weight-trend')} />

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
                <SegmentedControl options={GOAL_MODE_OPTIONS} value={goalMode} onChange={handleGoalModeChange} />
                <View style={styles.goalEditorBody}>
                    <View style={styles.startingContext}>
                        <Ionicons name="scale-outline" size={18} color={themeColors.primary} />
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
                        step={WEIGHT_INPUT_INCREMENT}
                        min={WEIGHT_INPUT_INCREMENT}
                        suffix={formatWeightUnit(user?.weight_unit)}
                    />
                    <View style={styles.dailyChangeSlot}>
                        <AppText variant="label">Daily calorie change</AppText>
                        {goalMode === 'maintain' ? (
                            <View style={styles.maintenanceNote}>
                                <AppText variant="muted">Maintenance goals use a steady calorie target with no daily deficit or surplus.</AppText>
                            </View>
                        ) : (
                            <GoalDailyChangeSelect
                                goalMode={goalMode}
                                value={dailyChangeAbs}
                                isOpen={isDailyChangeSelectorOpen}
                                onToggle={() => setIsDailyChangeSelectorOpen((current) => !current)}
                                onChange={(nextValue) => {
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
                        leftIcon={<Ionicons name="close" size={18} color={themeColors.onSurface} />}
                        onPress={() => setIsGoalEditorOpen(false)}
                        style={styles.rowField}
                    />
                    <AppButton
                        title={saveGoal.isPending ? 'Saving...' : 'Save goal'}
                        disabled={!canSave || saveGoal.isPending}
                        leftIcon={<Ionicons name="flag-outline" size={18} color={themeColors.onPrimary} />}
                        onPress={handleSave}
                        style={styles.rowField}
                    />
                </View>
            </BottomSheetModal>

            <WeightEntrySheet
                visible={isWeightEditorOpen}
                date={today}
                onClose={() => setIsWeightEditorOpen(false)}
            />
        </Screen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.md
    },
    startingContext: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: theme.colors.primaryContainer,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.md
    },
    startingText: {
        flex: 1,
        minWidth: 0
    },
    startingValue: {
        color: theme.colors.onPrimaryContainer,
        fontWeight: '900'
    },
    error: {
        color: theme.colors.danger
    }
});
