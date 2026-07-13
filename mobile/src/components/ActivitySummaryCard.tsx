import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ActivityDaysResponse } from '@calibrate/api-client';
import {
    getActivitySourceLabels,
    isActivitySummaryDelayed,
    isActivitySummaryEmpty
} from '../activity/presentation';
import { colors, spacing } from '../theme';
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
};

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Activity is temporarily unavailable. Food and weight logging still work normally.';
}

/** Observed Health Connect activity that never changes the profile-based calorie budget. */
export function ActivitySummaryCard({
    day,
    isToday,
    profileTdee,
    isLoading = false,
    error,
    onRetry,
    onOpenDetails
}: ActivitySummaryCardProps) {
    const summary = day?.summary;
    const records = day?.records ?? [];
    const isEmpty = isActivitySummaryEmpty(summary) && records.length === 0;
    const delayed = isActivitySummaryDelayed(summary, isToday);
    const sources = getActivitySourceLabels(records);
    const observedAt = summary ? new Date(summary.observed_at) : null;
    const observedLabel = observedAt && !Number.isNaN(observedAt.getTime())
        ? observedAt.toLocaleString()
        : null;
    const profileBaseline = typeof profileTdee === 'number' && Number.isFinite(profileTdee)
        ? formatCalories(profileTdee)
        : 'your profile estimate';

    return (
        <AppCard>
            <SectionHeader
                title="Activity"
                description={`Health Connect is observational. ${profileBaseline} TDEE remains the basis for your calorie target.`}
            />
            {isLoading ? (
                <View style={styles.skeletonGrid}>
                    {[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} width="48%" height={64} />)}
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
                    <View style={styles.metricRow}>
                        <MetricTile label="total kcal" value={formatNumber(summary?.total_calories_kcal, 0)} />
                        <MetricTile label="exercise min" value={formatNumber(summary?.exercise_minutes, 0)} />
                    </View>
                    <AppText variant="caption">Sources: {sources.join(', ')}</AppText>
                    {observedLabel && <AppText variant="caption">Last imported: {observedLabel}</AppText>}
                    {delayed && (
                        <AppText style={styles.delay}>
                            This summary has not refreshed recently. Samsung Health may still be syncing with Health Connect.
                        </AppText>
                    )}
                </>
            )}
            {onOpenDetails && (
                <AppButton
                    title="View activity history"
                    variant="secondary"
                    leftIcon={<Ionicons name="bar-chart-outline" size={18} color={colors.text} />}
                    onPress={onOpenDetails}
                />
            )}
        </AppCard>
    );
}

const styles = StyleSheet.create({
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
        fontWeight: '800'
    },
    error: {
        color: colors.danger
    },
    delay: {
        color: colors.warningDark
    }
});
