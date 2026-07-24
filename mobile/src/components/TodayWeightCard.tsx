import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MetricEntry } from '@calibrate/api-client';
import type { WeightUnit } from '@calibrate/shared';
import { AppPressableCard } from './AppPressableCard';
import { AppText } from './AppText';
import { formatWeight } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type TodayWeightCardProps = Omit<React.ComponentProps<typeof AppPressableCard>, 'children' | 'onPress'> & {
    metric: MetricEntry | null;
    weightUnit: WeightUnit | undefined;
    isToday: boolean;
    onPress: () => void;
    compact?: boolean;
};

/** Compact daily weigh-in summary and entry point for the Today dashboard. */
export const TodayWeightCard: React.FC<TodayWeightCardProps> = ({
    metric,
    weightUnit,
    isToday,
    onPress,
    compact = false,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const title = isToday ? "Today's weight" : 'Weight';
    const action = metric ? 'Edit' : 'Log';
    const metricLabel = metric ? formatWeight(metric.weight, weightUnit) : 'No weigh-in yet';
    const metricVariant = compact || !metric ? 'subtitle' : 'screenTitle';
    const supportingLabel = metric
        ? (isToday ? 'Logged today' : 'Logged for this day')
        : (isToday ? 'Add today\'s measurement' : 'Add a measurement for this day');

    return (
        <AppPressableCard
            {...props}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${metricLabel}. ${action} weight`}
            accessibilityHint={metric ? 'Opens this weigh-in for editing' : 'Opens the weight entry form'}
            onPress={onPress}
            style={[styles.card, compact && styles.cardCompact, style]}
        >
            <View style={styles.headerRow}>
                <AppText accessibilityRole="header" aria-level={2} variant={compact ? 'label' : 'screenTitle'}>
                    {title}
                </AppText>
                <View style={styles.viewAction}>
                    <AppText style={[styles.viewActionText, compact && styles.viewActionTextCompact]}>{action}</AppText>
                    <Ionicons name="chevron-forward" size={compact ? 17 : 19} color={theme.colors.primary} />
                </View>
            </View>

            <View style={[styles.summaryRow, compact && styles.summaryRowCompact]}>
                <View style={[styles.weightIcon, compact && styles.weightIconCompact]}>
                    <Ionicons name="scale-outline" size={compact ? 19 : 22} color={theme.colors.primary} />
                </View>
                <View style={[styles.summaryText, compact && styles.summaryTextCompact]}>
                    <AppText variant={metricVariant} numberOfLines={1}>
                        {metricLabel}
                    </AppText>
                    <AppText variant="muted">{supportingLabel}</AppText>
                </View>
            </View>
        </AppPressableCard>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        card: {
            gap: theme.spacing.md
        },
        cardCompact: {
            padding: theme.spacing.md,
            gap: theme.spacing.xs
        },
        headerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md
        },
        viewAction: {
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            gap: theme.spacing.xs
        },
        viewActionText: {
            color: theme.colors.primary,
            fontSize: theme.typography.small,
            fontWeight: '800'
        },
        viewActionTextCompact: {
            fontSize: theme.typography.caption
        },
        summaryRow: {
            minHeight: theme.interaction.minimumTouchTarget,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md
        },
        summaryRowCompact: {
            minHeight: theme.interaction.minimumTouchTarget,
            gap: theme.spacing.sm
        },
        weightIcon: {
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primaryContainer
        },
        weightIconCompact: {
            width: theme.interaction.minimumTouchTarget - theme.spacing.md,
            height: theme.interaction.minimumTouchTarget - theme.spacing.md
        },
        summaryText: {
            flex: 1,
            minWidth: 0,
            gap: theme.spacing.xs
        },
        summaryTextCompact: {
            gap: 0
        }
    });
}
