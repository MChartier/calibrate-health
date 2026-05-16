import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { getTodayDate } from '../../src/utils/dates';
import { colors, spacing } from '../../src/theme';

const MEAL_OPTIONS: MealPeriod[] = [
    MEAL_PERIODS.BREAKFAST,
    MEAL_PERIODS.MORNING_SNACK,
    MEAL_PERIODS.LUNCH,
    MEAL_PERIODS.AFTERNOON_SNACK,
    MEAL_PERIODS.DINNER,
    MEAL_PERIODS.EVENING_SNACK
];

const mealLabel = (meal: MealPeriod): string => meal.replace(/_/g, ' ').toLowerCase();

export default function LogScreen() {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const today = useMemo(() => getTodayDate(user?.timezone), [user?.timezone]);
    const [name, setName] = useState('');
    const [calories, setCalories] = useState('');
    const [meal, setMeal] = useState<MealPeriod>(MEAL_PERIODS.BREAKFAST);
    const [query, setQuery] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const foodQuery = useQuery({ queryKey: ['mobile-food', today], queryFn: () => api.getFoodLog(today) });

    const addFood = useMutation({
        mutationFn: () =>
            api.createFoodLog({
                date: today,
                meal_period: meal,
                name: name.trim(),
                calories: Number(calories)
            }),
        onSuccess: async () => {
            setName('');
            setCalories('');
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await queryClient.invalidateQueries({ queryKey: ['mobile-food', today] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-food-day', today] });
        }
    });

    const deleteFood = useMutation({
        mutationFn: (id: number) => api.deleteFoodLog(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-food', today] })
    });

    const searchFood = useMutation({
        mutationFn: () => api.searchFood(query),
        onSuccess: (response) => {
            setSearchError(null);
            const first = response.items[0];
            if (first) {
                setName(first.name);
                if (typeof first.calories === 'number') {
                    setCalories(String(Math.round(first.calories)));
                }
            } else {
                setSearchError('No matching foods found.');
            }
        },
        onError: (error) => {
            setSearchError(error instanceof Error ? error.message : 'Food search failed.');
        }
    });

    const totalCalories = (foodQuery.data ?? []).reduce((total, entry) => total + entry.calories, 0);
    const canAdd = name.trim().length > 0 && Number.isFinite(Number(calories)) && Number(calories) >= 0;

    return (
        <Screen>
            <View>
                <AppText variant="title">Food log</AppText>
                <AppText variant="muted">{today} | {totalCalories} kcal</AppText>
            </View>

            <AppCard>
                <TextField label="Search foods" value={query} onChangeText={setQuery} returnKeyType="search" />
                {searchError && <AppText style={styles.error}>{searchError}</AppText>}
                <View style={styles.row}>
                    <AppButton title={searchFood.isPending ? 'Searching...' : 'Search'} disabled={!query.trim() || searchFood.isPending} onPress={() => searchFood.mutate()} />
                    <AppButton title="Scan" variant="secondary" onPress={() => router.push('/barcode')} />
                </View>
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">Add entry</AppText>
                <View style={styles.chips}>
                    {MEAL_OPTIONS.map((option) => (
                        <Pressable key={option} onPress={() => setMeal(option)} style={[styles.chip, option === meal && styles.chipActive]}>
                            <AppText style={[styles.chipText, option === meal && styles.chipTextActive]}>{mealLabel(option)}</AppText>
                        </Pressable>
                    ))}
                </View>
                <TextField label="Food name" value={name} onChangeText={setName} />
                <TextField label="Calories" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
                <AppButton title={addFood.isPending ? 'Adding...' : 'Add food'} disabled={!canAdd || addFood.isPending} onPress={() => addFood.mutate()} />
            </AppCard>

            {(foodQuery.data ?? []).map((entry) => (
                <AppCard key={entry.id}>
                    <View style={styles.entryHeader}>
                        <View>
                            <AppText variant="subtitle">{entry.name}</AppText>
                            <AppText variant="muted">{mealLabel(entry.meal_period)}</AppText>
                        </View>
                        <AppText style={styles.calories}>{entry.calories}</AppText>
                    </View>
                    <AppButton title="Delete" variant="secondary" onPress={() => deleteFood.mutate(entry.id)} />
                </AppCard>
            ))}
        </Screen>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    chip: {
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.surface
    },
    chipActive: {
        backgroundColor: colors.primary
    },
    chipText: {
        color: colors.text,
        textTransform: 'capitalize'
    },
    chipTextActive: {
        color: '#ffffff',
        fontWeight: '800'
    },
    entryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    calories: {
        fontSize: 22,
        fontWeight: '900'
    },
    error: {
        color: colors.danger
    }
});
