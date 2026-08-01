import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type FoodLogSummaryCardProps = Omit<React.ComponentProps<typeof AppCard>, 'children'> & {
    entries: FoodLogEntry[];
    onPress: () => void;
    onAddFood?: () => void;
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
    onAddFood,
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
        <AppCard
            {...props}
            style={[styles.card, compact && styles.cardCompact, style]}
        >
            <View style={[styles.logSection, compact && styles.logSectionCompact]}>
                {compact && (
                    <Pressable
                        testID="food-log-card-press-layer"
                        accessible={false}
                        tabIndex={-1}
                        onPress={onPress}
                        style={({ pressed }) => [
                            StyleSheet.absoluteFill,
                            styles.compactPressLayer,
                            pressed && styles.pressed
                        ]}
                    />
                )}

                <View
                    testID={compact ? 'compact-food-log-header' : undefined}
                    pointerEvents={compact ? 'none' : undefined}
                    style={styles.headerRow}
                >
                    <AppText accessibilityRole="header" aria-level={2} variant={compact ? 'label' : 'screenTitle'}>
                        Food log
                    </AppText>
                    {compact ? (
                        <View
                            accessibilityElementsHidden
                            aria-hidden
                            importantForAccessibility="no-hide-descendants"
                            style={styles.viewAction}
                        >
                            <AppText style={[styles.viewActionText, styles.viewActionTextCompact]}>View</AppText>
                            <Ionicons name="chevron-forward" size={17} color={theme.colors.primary} />
                        </View>
                    ) : (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="View full food log"
                            accessibilityHint="Opens the detailed food log for this day"
                            onPress={onPress}
                            style={({ pressed }) => [
                                styles.viewAction,
                                styles.viewActionFull,
                                pressed && styles.pressed
                            ]}
                        >
                            <AppText style={styles.viewActionText}>View full log</AppText>
                            <Ionicons name="chevron-forward" size={19} color={theme.colors.primary} />
                        </Pressable>
                    )}
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Food log. ${accessibilitySummary}. View full log`}
                    accessibilityHint="Opens the detailed food log for this day"
                    onPress={onPress}
                    style={({ pressed }) => [
                        styles.summaryPressable,
                        pressed && styles.pressed
                    ]}
                >
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
                                <AppText variant="muted" numberOfLines={2}>
                                    {trackingUnavailable ? 'No representative calorie record for this day.' : 'Add a food to start this day.'}
                                </AppText>
                            </View>
                        </View>
                    )}
                </Pressable>
            </View>
            {onAddFood && (
                <AppButton
                    title="Add food"
                    accessibilityHint="Opens food search for this day"
                    leftIcon={<Ionicons name="add" size={20} color={theme.colors.onPrimary} />}
                    onPress={onAddFood}
                    style={styles.addFoodButton}
                />
            )}
        </AppCard>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        card: {
            gap: theme.spacing.sm
        },
        cardCompact: {
            padding: theme.spacing.md
        },
        logSection: {
            position: 'relative',
            gap: theme.spacing.md
        },
        logSectionCompact: {
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
            gap: theme.spacing.xs,
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            paddingLeft: theme.spacing.sm
        },
        viewActionFull: {
            minHeight: theme.interaction.minimumTouchTarget
        },
        viewActionText: {
            color: theme.colors.primary,
            fontSize: 14,
            fontWeight: '800'
        },
        viewActionTextCompact: {
            fontSize: theme.typography.caption
        },
        compactPressLayer: {
            borderRadius: theme.radius.md
        },
        summaryPressable: {
            minHeight: theme.interaction.minimumTouchTarget,
            minWidth: 0,
            justifyContent: 'center',
            borderRadius: theme.radius.md
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
        },
        addFoodButton: {
            alignSelf: 'stretch',
            width: '100%',
            paddingHorizontal: theme.spacing.md
        },
        pressed: {
            backgroundColor: theme.colors.surfacePressed
        }
    });
}
