import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ActivityDaysResponse } from '@calibrate/api-client';
import {
    getActivitySourceLabels,
    isActivitySummaryDelayed,
    isActivitySummaryEmpty
} from '../activity/presentation';
import { spacing, useAppTheme, type AppThemeColors } from '../theme';
import { formatCalories, formatNumber } from '../utils/format';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { MetricTile } from './MetricTile';
import { SectionHeader } from './SectionHeader';
import { SkeletonBlock } from './SkeletonBlock';

export type ActivityDay = ActivityDaysResponse['days'][number];

type ActivitySummaryCardProps = {
    day: ActivityDay | null | undefined;
    isToday: boolean;
    profileTdee?: number | null;
    isLoading?: boolean;
    error?: unknown;
    onRetry?: () => void;
    onOpenDetails?: () => void;
    compact?: boolean;
};

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Activity is temporarily unavailable. Food and weight logging still work normally.';
}

function formatSyncFreshness(observedAt: Date | null): string | null {
    if (!observedAt || Number.isNaN(observedAt.getTime())) return null;
    const elapsedMinutes = Math.max(0, Math.round((Date.now() - observedAt.getTime()) / 60_000));
    if (elapsedMinutes < 1) return 'Synced just now';
    if (elapsedMinutes < 60) return `Synced ${elapsedMinutes}m ago`;
    const elapsedHours = Math.round(elapsedMinutes / 60);
    if (elapsedHours < 24) return `Synced ${elapsedHours}h ago`;
    return `Synced ${observedAt.toLocaleDateString()}`;
}

/** Observed Health Connect activity that never changes the profile-based calorie budget. */
export function ActivitySummaryCard({
    day,
    isToday,
    profileTdee,
    isLoading = false,
    error,
    onRetry,
    onOpenDetails,
    compact = false
}: ActivitySummaryCardProps) {
    const { colors } = useAppTheme();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const summary = day?.summary;
    const records = day?.records ?? [];
    const isEmpty = isActivitySummaryEmpty(summary) && records.length === 0;
    const delayed = isActivitySummaryDelayed(summary, isToday);
    const sources = getActivitySourceLabels(records);
    const observedAt = summary ? new Date(summary.observed_at) : null;
    const observedLabel = observedAt && !Number.isNaN(observedAt.getTime())
        ? observedAt.toLocaleString()
        : null;
    const syncFreshness = formatSyncFreshness(observedAt);
    const profileBaseline = typeof profileTdee === 'number' && Number.isFinite(profileTdee)
        ? formatCalories(profileTdee)
        : 'your profile estimate';

    return (
        <AppCard>
            <SectionHeader
                title="Activity"
                description={compact
                    ? [sources[0] ?? 'Health Connect', syncFreshness].filter(Boolean).join(' | ')
                    : `Health Connect is observational. ${profileBaseline} TDEE remains the basis for your calorie target.`}
            />
            {isLoading ? (
                <View style={styles.skeletonGrid}>
                    {(compact ? [0, 1] : [0, 1, 2, 3]).map((index) => <SkeletonBlock key={index} width="48%" height={64} />)}
                </View>
            ) : error ? (
                <>
                    <AppText accessibilityRole="alert" style={styles.error}>{errorMessage(error)}</AppText>
                    {onRetry && (
                        <AppButton
                            title="Retry activity"
                            variant="secondary"
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={colors.text} />}
                            onPress={onRetry}
                        />
                    )}
                </>
            ) : isEmpty ? (
                <View style={styles.emptyState}>
                    <Ionicons name="walk-outline" size={28} color={colors.muted} />
                    <View style={styles.emptyText}>
                        <AppText style={styles.emptyTitle}>No imported activity for this day</AppText>
                        <AppText variant="muted">
                            {isToday
                                ? 'Samsung Health and Health Connect can take time to deliver Galaxy Watch activity.'
                                : 'No Health Connect summary has been imported for this date.'}
                        </AppText>
                    </View>
                </View>
            ) : (
                <>
                    <View style={styles.metricRow}>
                        <MetricTile label="steps" value={formatNumber(summary?.steps, 0)} />
                        <MetricTile label="active kcal" value={formatNumber(summary?.active_calories_kcal, 0)} />
                    </View>
                    {!compact && (
                        <>
                            <View style={styles.metricRow}>
                                <MetricTile label="total kcal" value={formatNumber(summary?.total_calories_kcal, 0)} />
                                <MetricTile label="exercise min" value={formatNumber(summary?.exercise_minutes, 0)} />
                            </View>
                            <AppText variant="caption">Sources: {sources.join(', ')}</AppText>
                            {observedLabel && <AppText variant="caption">Last imported: {observedLabel}</AppText>}
                        </>
                    )}
                    {delayed && (
                        <AppText style={styles.delay}>
                            This summary has not refreshed recently. Samsung Health may still be syncing with Health Connect.
                        </AppText>
                    )}
                </>
            )}
            {onOpenDetails && (
                <AppButton
                    title={compact ? 'Activity details' : 'View activity history'}
                    variant={compact ? 'ghost' : 'secondary'}
                    leftIcon={<Ionicons name="bar-chart-outline" size={18} color={colors.text} />}
                    onPress={onOpenDetails}
                />
            )}
        </AppCard>
    );
}

function createStyles(colors: AppThemeColors) {
    return StyleSheet.create({
        metricRow: {
            flexDirection: 'row',
            gap: spacing.md
        },
        skeletonGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: spacing.sm
        },
        emptyState: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md
        },
        emptyText: {
            flex: 1,
            gap: spacing.xs
        },
        emptyTitle: {
            fontWeight: '700'
        },
        error: {
            color: colors.danger
        },
        delay: {
            color: colors.warning
        }
    });
}
