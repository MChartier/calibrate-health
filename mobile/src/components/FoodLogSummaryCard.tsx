import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppActionRow } from './AppActionRow';
import { AppText } from './AppText';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { type AppTheme, useAppTheme } from '../theme';

type FoodLogSummaryCardProps = Omit<React.ComponentProps<typeof AppActionRow>, 'accessibilityLabel' | 'children' | 'onPress' | 'secondaryAction'> & {
    entries: FoodLogEntry[];
    onPress: () => void;
    onAddFood?: () => void;
    trackingUnavailable?: boolean;
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

    let preview = 'Add a food to start this day.';
    if (trackingUnavailable) preview = 'No representative calorie record for this day.';
    if (recentMeal) preview = formatEntryPreview(recentMeal.entries);

    return (
        <AppActionRow
            {...props}
            testID={props.testID ?? 'food-log-summary-card'}
            primaryActionTestID="food-log-card-press-layer"
            accessibilityRole="button"
            accessibilityLabel={`Food log. ${accessibilitySummary}. View full log`}
            accessibilityHint="Opens the detailed food log for this day"
            onPress={onPress}
            style={style}
            contentStyle={styles.record}
            secondaryActionPlacement="footer"
            secondaryActionTestID="food-log-card-secondary-region"
            secondaryAction={onAddFood ? (
                <AppButton
                    title="Add food"
                    accessibilityHint="Opens food search for this day"
                    leftIcon={<Ionicons name="add" size={20} color={theme.colors.onPrimary} />}
                    onPress={onAddFood}
                />
            ) : undefined}
        >
            <View style={styles.summaryRow}>
                <View style={styles.iconTile} accessibilityElementsHidden aria-hidden>
                    <Ionicons name="restaurant-outline" size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.summaryText}>
                    <AppText variant="muted">Food log</AppText>
                    <View style={styles.mealHeading}>
                        <AppText style={styles.mealName}>
                            {recentMeal ? formatMealPeriod(recentMeal.meal) : 'Nothing logged yet'}
                        </AppText>
                        {recentMeal && <AppText style={styles.mealCalories}>
                            {formatCalories(recentMeal.calories)}
                        </AppText>}
                    </View>
                    <AppText style={styles.preview}>{preview}</AppText>
                </View>
                <View accessibilityElementsHidden aria-hidden>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
                </View>
            </View>
        </AppActionRow>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        record: { paddingVertical: theme.spacing.sm },
        // Decorative icon slots preserve the original record alignment without making the row a card.
        iconTile: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
        summaryRow: { minHeight: theme.interaction.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
        summaryText: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
        mealName: { ...theme.typography.styles.section, flexShrink: 1 },
        mealHeading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: theme.spacing.sm },
        mealCalories: { flexShrink: 0, color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
        preview: { color: theme.colors.onSurfaceVariant }
    });
}
