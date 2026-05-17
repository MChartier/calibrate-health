import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import type { FoodLogEntry } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { SectionHeader } from './SectionHeader';
import { spacing } from '../theme';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { MEAL_OPTIONS } from '../utils/meals';

type MealBreakdownCardProps = ViewProps & {
    entries: FoodLogEntry[];
    dailyTarget?: number | null;
};

type MealTotal = {
    meal: MealPeriod;
    calories: number;
    count: number;
};

/**
 * Per-meal calorie distribution that mirrors the PWA's daily log summary in native controls.
 */
export const MealBreakdownCard: React.FC<MealBreakdownCardProps> = ({
    entries,
    dailyTarget,
    style,
    ...props
}) => {
    const mealTotals = useMemo<MealTotal[]>(() => {
        return MEAL_OPTIONS.map((meal) => {
            const mealEntries = entries.filter((entry) => entry.meal_period === meal);
            return {
                meal,
                calories: mealEntries.reduce((total, entry) => total + entry.calories, 0),
                count: mealEntries.length
            };
        });
    }, [entries]);

    const totalCalories = mealTotals.reduce((total, meal) => total + meal.calories, 0);
    const maxMealCalories = Math.max(...mealTotals.map((meal) => meal.calories), dailyTarget ?? 0, 1);

    return (
        <AppCard {...props} style={style}>
            <SectionHeader
                title="Meal breakdown"
                description={`${formatCalories(totalCalories)} logged across ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`}
            />
            {mealTotals.map((meal) => (
                <View key={meal.meal} style={styles.mealRow}>
                    <View style={styles.mealHeader}>
                        <AppText variant="body">{formatMealPeriod(meal.meal)}</AppText>
                        <AppText variant="label">{formatCalories(meal.calories)}</AppText>
                    </View>
                    <ProgressBar value={meal.calories / maxMealCalories} />
                    <AppText variant="caption">{meal.count === 0 ? 'No entries' : `${meal.count} entr${meal.count === 1 ? 'y' : 'ies'}`}</AppText>
                </View>
            ))}
        </AppCard>
    );
};

const styles = StyleSheet.create({
    mealRow: {
        gap: spacing.xs
    },
    mealHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    }
});
