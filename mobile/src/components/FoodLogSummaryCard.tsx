import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { NavigableCard } from './NavigableCard';
import { AppText } from './AppText';
import { CardHeader } from './CardHeader';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type FoodLogSummaryCardProps = Omit<React.ComponentProps<typeof NavigableCard>, 'accessibilityLabel' | 'children' | 'onPress' | 'secondaryAction'> & {
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
        <NavigableCard
            {...props}
            testID={props.testID ?? 'food-log-summary-card'}
            primaryActionTestID="food-log-card-press-layer"
            accessibilityRole="button"
            accessibilityLabel={`Food log. ${accessibilitySummary}. View full log`}
            accessibilityHint="Opens the detailed food log for this day"
            onPress={onPress}
            style={style}
            contentStyle={[styles.card, compact && styles.cardCompact]}
            secondaryActionPlacement="footer"
            secondaryActionTestID="food-log-card-secondary-region"
            secondaryAction={onAddFood ? (
                <AppButton
                    title="Add food"
                    accessibilityHint="Opens food search for this day"
                    leftIcon={<Ionicons name="add" size={20} color={theme.colors.onPrimary} />}
                    onPress={onAddFood}
                    style={styles.addFoodButton}
                />
            ) : undefined}
        >
            <View style={[styles.logSection, compact && styles.logSectionCompact]}>
                <CardHeader
                    headingTestID={compact ? 'compact-food-log-header' : undefined}
                    title="Food log"
                    density="compact"
                    action={<View
                        accessibilityElementsHidden
                        aria-hidden
                        importantForAccessibility="no-hide-descendants"
                        style={styles.viewAction}
                    >
                        <AppText style={[styles.viewActionText, compact && styles.viewActionTextCompact]}>
                            {compact ? 'View' : 'View full log'}
                        </AppText>
                        <Ionicons name="chevron-forward" size={compact ? 17 : 19} color={theme.colors.primary} />
                    </View>}
                />

                <View style={styles.summaryContent}>
                    {recentMeal ? (
                        <View style={[styles.summaryRow, compact && styles.summaryRowCompact]}>
                            <View style={[styles.mealIcon, compact && styles.mealIconCompact]}>
                                <Ionicons name="restaurant-outline" size={compact ? 19 : 21} color={theme.colors.primary} />
                            </View>
                            <View style={[styles.summaryText, compact && styles.summaryTextCompact]}>
                                <View style={styles.mealHeading}>
                                    <AppText variant="subtitle" style={styles.mealName}>
                                        {formatMealPeriod(recentMeal.meal)}
                                    </AppText>
                                    <AppText variant="label" style={styles.mealCalories}>
                                        {formatCalories(recentMeal.calories)}
                                    </AppText>
                                </View>
                                <AppText variant="muted">
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
                </View>
            </View>
        </NavigableCard>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        card: {
            gap: theme.spacing.sm
        },
        cardCompact: {
            padding: theme.spacing.md,
            paddingTop: theme.spacing.lg
        },
        logSection: {
            position: 'relative',
            gap: theme.spacing.md
        },
        logSectionCompact: {
            gap: theme.spacing.xs
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
        viewActionText: {
            color: theme.colors.primary,
            fontSize: 14,
            fontWeight: '800'
        },
        viewActionTextCompact: {
            fontSize: theme.typography.caption
        },

        summaryContent: {
            minHeight: theme.interaction.minimumTouchTarget,
            minWidth: 0,
            justifyContent: 'center'
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
            flexWrap: 'wrap',
            gap: theme.spacing.sm
        },
        mealName: {
            flex: 1,
            minWidth: 0
        },
        mealCalories: {
            flexShrink: 0
        },
        addFoodButton: {
            position: 'relative',
            alignSelf: 'stretch',
            width: '100%',
            paddingHorizontal: theme.spacing.md
        }
    });
}
