import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type FoodLogSummaryCardProps = Omit<ViewProps, 'children'> & {
    entries: FoodLogEntry[];
    onPress: () => void;
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
export const FoodLogSummaryCard: React.FC<FoodLogSummaryCardProps> = ({ entries, onPress, style, ...props }) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    // The food endpoint returns entries in creation order, so the final entry identifies the latest populated meal.
    const recentMeal = useMemo(() => getRecentMealSummary(entries), [entries]);
    const accessibilitySummary = recentMeal
        ? `${formatMealPeriod(recentMeal.meal)}, ${formatCalories(recentMeal.calories)}, ${recentMeal.entries.length} ${recentMeal.entries.length === 1 ? 'item' : 'items'}`
        : 'No food logged';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Food log. ${accessibilitySummary}. View full log`}
            accessibilityHint="Opens the full food log for this day"
            android_ripple={{ color: theme.colors.ripple }}
            onPress={onPress}
            style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        >
            <AppCard {...props} style={[styles.card, style]}>
                <View style={styles.headerRow}>
                    <AppText accessibilityRole="header" aria-level={2} variant="screenTitle">Food log</AppText>
                    <View style={styles.viewAction}>
                        <AppText style={styles.viewActionText}>View full log</AppText>
                        <Ionicons name="chevron-forward" size={19} color={theme.colors.primary} />
                    </View>
                </View>

                {recentMeal ? (
                    <View style={styles.summaryRow}>
                        <View style={styles.mealIcon}>
                            <Ionicons name="restaurant-outline" size={21} color={theme.colors.primary} />
                        </View>
                        <View style={styles.summaryText}>
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
                    <View style={styles.summaryRow}>
                        <View style={styles.mealIcon}>
                            <Ionicons name="restaurant-outline" size={21} color={theme.colors.muted} />
                        </View>
                        <View style={styles.summaryText}>
                            <AppText variant="subtitle">Nothing logged yet</AppText>
                            <AppText variant="muted">Use Add food to start this day.</AppText>
                        </View>
                    </View>
                )}
            </AppCard>
        </Pressable>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        pressable: {
            width: '100%',
            borderRadius: theme.radius.lg,
            overflow: 'hidden'
        },
        card: {
            gap: theme.spacing.md
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
        summaryRow: {
            minHeight: theme.interaction.minimumTouchTarget,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md
        },
        mealIcon: {
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primaryContainer
        },
        summaryText: {
            flex: 1,
            minWidth: 0,
            gap: theme.spacing.xs
        },
        mealHeading: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm
        },
        mealName: {
            flex: 1,
            minWidth: 0
        },
        pressed: {
            opacity: 0.86
        }
    });
}
