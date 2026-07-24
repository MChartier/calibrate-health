import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppPressableCard } from './AppPressableCard';
import { AppText } from './AppText';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type FoodLogSummaryCardProps = Omit<React.ComponentProps<typeof AppPressableCard>, 'children' | 'onPress'> & {
    entries: FoodLogEntry[];
    onPress: () => void;
    trackingUnavailable?: boolean;
    compact?: boolean;
};

type RecentMealSummary = {
    meal: FoodLogEntry['meal_period'];
    entries: FoodLogEntry[];
    calories: number;
};

function getRecentMealSummary(entries: FoodLogEntry[]): RecentMealSummary | null {
    const recentEntry = entries.at(-1);
    if (!recentEntry) return null;

    const recentMealEntries = entries.filter((entry) => entry.meal_period === recentEntry.meal_period);
    return {
        meal: recentEntry.meal_period,
        entries: recentMealEntries,
        calories: recentMealEntries.reduce((total, entry) => total + entry.calories, 0)
    };
}

function formatEntryPreview(entries: FoodLogEntry[]): string {
    const visibleNames = entries.slice(0, 2).map((entry) => entry.name);
    const remainingCount = entries.length - visibleNames.length;
    return remainingCount > 0
        ? `${visibleNames.join(', ')} +${remainingCount} more`
        : visibleNames.join(', ');
}

/** Compact Today summary that opens the full editable food log. */
export const FoodLogSummaryCard: React.FC<FoodLogSummaryCardProps> = ({
    entries,
    onPress,
    trackingUnavailable = false,
    compact = false,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    // The food endpoint returns entries in creation order, so the final entry identifies the latest populated meal.
    const recentMeal = useMemo(() => getRecentMealSummary(entries), [entries]);
    const accessibilitySummary = recentMeal
        ? `${formatMealPeriod(recentMeal.meal)}, ${formatCalories(recentMeal.calories)}, ${recentMeal.entries.length} ${recentMeal.entries.length === 1 ? 'item' : 'items'}`
        : 'No food logged';

    return (
        <AppPressableCard
            {...props}
            accessibilityRole="button"
            accessibilityLabel={`Food log. ${accessibilitySummary}. View full log`}
            accessibilityHint="Opens the full food log for this day"
            onPress={onPress}
            style={[styles.card, compact && styles.cardCompact, style]}
        >
            <View style={styles.headerRow}>
                <AppText accessibilityRole="header" aria-level={2} variant={compact ? 'label' : 'screenTitle'}>
                    Food log
                </AppText>
                <View style={styles.viewAction}>
                    <AppText style={[styles.viewActionText, compact && styles.viewActionTextCompact]}>
                        {compact ? 'View' : 'View full log'}
                    </AppText>
                    <Ionicons name="chevron-forward" size={compact ? 17 : 19} color={theme.colors.primary} />
                </View>
            </View>

            {recentMeal ? (
                <View style={[styles.summaryRow, compact && styles.summaryRowCompact]}>
                    <View style={[styles.mealIcon, compact && styles.mealIconCompact]}>
                        <Ionicons name="restaurant-outline" size={compact ? 19 : 21} color={theme.colors.primary} />
                    </View>
                    <View style={[styles.summaryText, compact && styles.summaryTextCompact]}>
                        <View style={styles.mealHeading}>
                            <AppText variant="subtitle" numberOfLines={1} style={styles.mealName}>
                                {formatMealPeriod(recentMeal.meal)}
                            </AppText>
                            <AppText variant="label" numberOfLines={1}>{formatCalories(recentMeal.calories)}</AppText>
                        </View>
                        <AppText variant="muted" numberOfLines={1}>
                            {formatEntryPreview(recentMeal.entries)}
                        </AppText>
                    </View>
                </View>
            ) : (
                <View style={[styles.summaryRow, compact && styles.summaryRowCompact]}>
                    <View style={[styles.mealIcon, compact && styles.mealIconCompact]}>
                        <Ionicons name="restaurant-outline" size={compact ? 19 : 21} color={theme.colors.muted} />
                    </View>
                    <View style={[styles.summaryText, compact && styles.summaryTextCompact]}>
                        <AppText variant="subtitle">Nothing logged yet</AppText>
                        <AppText variant="muted">
                            {trackingUnavailable ? 'No representative calorie record for this day.' : 'Use Add food to start this day.'}
                        </AppText>
                    </View>
                </View>
            )}
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
            fontSize: 14,
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
        mealIcon: {
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primaryContainer
        },
        mealIconCompact: {
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
        },
        mealHeading: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm
        },
        mealName: {
            flex: 1,
            minWidth: 0
        }
    });
}
