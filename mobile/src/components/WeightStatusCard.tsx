import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MetricEntry, TrendMetricEntry, UserClientPayload } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';
import { formatNumber, formatWeight, formatWeightUnit } from '../utils/format';

type WeightStatusCardProps = ViewProps & {
    latestMetric: MetricEntry | null | undefined;
    latestTrendMetric: TrendMetricEntry | null | undefined;
    user: UserClientPayload | null;
    onEditWeight: () => void;
};

function formatMetricDate(value: string | null | undefined): string {
    if (!value) return '-';
    const dateOnly = value.split('T')[0] ?? value;
    const [yearString, monthString, dayString] = dateOnly.split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return dateOnly;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatSignedWeight(value: number | null, unit: string): string {
    if (value === null || !Number.isFinite(value)) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatNumber(value, 1)} ${unit}`;
}

/**
 * Native counterpart to the top PWA Weight card: latest weight, edit action, and trend context.
 */
export const WeightStatusCard: React.FC<WeightStatusCardProps> = ({
    latestMetric,
    latestTrendMetric,
    user,
    onEditWeight,
    style,
    ...props
}) => {
    const unit = formatWeightUnit(user?.weight_unit);
    const deltaVsTrend =
        typeof latestMetric?.weight === 'number' && typeof latestTrendMetric?.trend_weight === 'number'
            ? latestMetric.weight - latestTrendMetric.trend_weight
            : null;
    const expectedRange =
        typeof latestTrendMetric?.trend_ci_lower === 'number' && typeof latestTrendMetric?.trend_ci_upper === 'number'
            ? `${formatNumber(latestTrendMetric.trend_ci_lower, 1)} - ${formatNumber(latestTrendMetric.trend_ci_upper, 1)} ${unit}`
            : '-';

    return (
        <AppCard {...props} style={style}>
            <View style={styles.header}>
                <AppText variant="screenTitle">Weight</AppText>
                <AppButton
                    title="Edit weight"
                    variant="secondary"
                    leftIcon={<Ionicons name="pencil" size={18} color={colors.primaryDark} />}
                    onPress={onEditWeight}
                    style={styles.editButton}
                />
            </View>
            <View style={styles.latestRow}>
                <View style={styles.iconTile}>
                    <Ionicons name="scale-outline" size={22} color={colors.primaryDark} />
                </View>
                <View style={styles.latestText}>
                    <AppText style={styles.latestWeight}>{formatWeight(latestMetric?.weight, user?.weight_unit)}</AppText>
                    <AppText variant="muted">As of {formatMetricDate(latestMetric?.date)}</AppText>
                </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.trendPanel}>
                <View style={styles.trendPanelHeader}>
                    <Ionicons name="analytics-outline" size={18} color={colors.primaryDark} />
                    <AppText variant="subtitle">Compared with trend</AppText>
                </View>
                <View style={styles.contextLine}>
                    <AppText variant="caption">Latest</AppText>
                    <AppText style={styles.contextValue}>{formatSignedWeight(deltaVsTrend, unit)} vs trend</AppText>
                </View>
                <View style={styles.contextLine}>
                    <AppText variant="caption">Expected range</AppText>
                    <AppText style={styles.contextValue}>{expectedRange}</AppText>
                </View>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    editButton: {
        minHeight: 42,
        paddingHorizontal: spacing.md
    },
    latestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg
    },
    iconTile: {
        width: 64,
        height: 64,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    latestText: {
        flex: 1,
        minWidth: 0
    },
    latestWeight: {
        color: colors.text,
        fontSize: 40,
        lineHeight: 46,
        fontWeight: '900'
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border
    },
    trendPanel: {
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        padding: spacing.md,
        gap: spacing.sm
    },
    trendPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    contextLine: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    contextValue: {
        color: colors.primaryDark,
        flexShrink: 1,
        textAlign: 'right',
        fontSize: 16,
        fontWeight: '900'
    }
});
