import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodLogCreatePayload, FoodSearchResult, MyFoodSummary, RecentFoodSummary } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { NumberStepperField } from './NumberStepperField';
import { SectionHeader } from './SectionHeader';
import { TextField } from './TextField';
import { useAuth } from '../auth/AuthContext';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatCalories, formatMealChipLabel } from '../utils/format';
import { MEAL_OPTIONS } from '../utils/meals';
import { colors, radius, spacing } from '../theme';

type AddFoodSheetProps = {
    visible: boolean;
    date: string;
    initialMeal?: MealPeriod | null;
    onClose: () => void;
    onLogged?: () => void;
};

function foodResultCalories(result: FoodSearchResult): string {
    return typeof result.calories === 'number' ? formatCalories(result.calories) : 'Calories not listed';
}

function buildSearchFoodPayload(result: FoodSearchResult, date: string, meal: MealPeriod, servings: number): FoodLogCreatePayload {
    const caloriesPerServing = typeof result.calories === 'number' ? result.calories : 0;
    const calories = Math.round(caloriesPerServing * servings);

    return {
        date,
        meal_period: meal,
        name: result.name,
        calories,
        servings_consumed: servings,
        calories_per_serving_snapshot: caloriesPerServing,
        external_source: result.source ?? null,
        external_id: result.id,
        brand: result.brand ?? null,
        barcode: result.barcode ?? null
    };
}

function buildRecentFoodPayload(recent: RecentFoodSummary, date: string, meal: MealPeriod): FoodLogCreatePayload {
    if (recent.my_food_id) {
        return {
            date,
            meal_period: meal,
            my_food_id: recent.my_food_id,
            servings_consumed: recent.servings_consumed ?? 1
        };
    }

    return {
        date,
        meal_period: meal,
        name: recent.name,
        calories: recent.calories,
        servings_consumed: recent.servings_consumed,
        serving_size_quantity_snapshot: recent.serving_size_quantity_snapshot,
        serving_unit_label_snapshot: recent.serving_unit_label_snapshot,
        calories_per_serving_snapshot: recent.calories_per_serving_snapshot,
        external_source: recent.external_source,
        external_id: recent.external_id,
        brand: recent.brand_snapshot,
        locale: recent.locale_snapshot,
        barcode: recent.barcode_snapshot,
        measure_label: recent.measure_label_snapshot,
        grams_per_measure_snapshot: recent.grams_per_measure_snapshot,
        measure_quantity_snapshot: recent.measure_quantity_snapshot,
        grams_total_snapshot: recent.grams_total_snapshot
    };
}

/**
 * Focused add-food bottom sheet used by the Log tab and add-food route.
 */
export const AddFoodSheet: React.FC<AddFoodSheetProps> = ({
    visible,
    date,
    initialMeal,
    onClose,
    onLogged
}) => {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [calories, setCalories] = useState('');
    const [meal, setMeal] = useState<MealPeriod>(initialMeal ?? MEAL_PERIODS.BREAKFAST);
    const [servings, setServings] = useState('1');
    const [query, setQuery] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const foodDayQuery = useQuery({
        queryKey: ['mobile-food-day', date],
        queryFn: () => api.getFoodDay(date),
        enabled: visible
    });
    const recentFoodsQuery = useQuery({
        queryKey: ['mobile-recent-foods'],
        queryFn: () => api.getRecentFoods({ limit: 6 }),
        enabled: visible
    });
    const myFoodsQuery = useQuery({
        queryKey: ['mobile-my-foods'],
        queryFn: () => api.getMyFoods(),
        enabled: visible
    });
    const isDayComplete = foodDayQuery.data?.is_complete ?? false;

    useEffect(() => {
        if (visible && initialMeal && MEAL_OPTIONS.includes(initialMeal)) {
            setMeal(initialMeal);
        }
    }, [initialMeal, visible]);

    async function invalidateLogQueries() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['mobile-food', date] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-food-day', date] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] })
        ]);
    }

    async function confirmLogged() {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await invalidateLogQueries();
        onLogged?.();
        onClose();
    }

    const addFood = useMutation({
        mutationFn: () =>
            api.createFoodLog({
                date,
                meal_period: meal,
                name: name.trim(),
                calories: Number(calories)
            }),
        onSuccess: async () => {
            setName('');
            setCalories('');
            await confirmLogged();
        }
    });

    const logRecentFood = useMutation({
        mutationFn: (recent: RecentFoodSummary) => api.createFoodLog(buildRecentFoodPayload(recent, date, meal)),
        onSuccess: confirmLogged
    });

    const logMyFood = useMutation({
        mutationFn: (item: MyFoodSummary) =>
            api.createFoodLog({
                date,
                meal_period: meal,
                my_food_id: item.id,
                servings_consumed: Number(servings) > 0 ? Number(servings) : 1
            }),
        onSuccess: confirmLogged
    });

    const logSearchResult = useMutation({
        mutationFn: (result: FoodSearchResult) =>
            api.createFoodLog(buildSearchFoodPayload(result, date, meal, Number(servings) > 0 ? Number(servings) : 1)),
        onSuccess: confirmLogged
    });

    const searchFood = useMutation({
        mutationFn: () => api.searchFood(query),
        onSuccess: (response) => {
            setSearchError(response.items.length === 0 ? 'No matching foods found.' : null);
            const first = response.items[0];
            if (first) {
                applySearchResult(first);
            }
        },
        onError: (error) => {
            setSearchError(error instanceof Error ? error.message : 'Food search failed.');
        }
    });

    const canAdd = !isDayComplete && name.trim().length > 0 && Number.isFinite(Number(calories)) && Number(calories) >= 0;

    function applySearchResult(result: FoodSearchResult) {
        setName(result.name);
        if (typeof result.calories === 'number') {
            setCalories(String(Math.round(result.calories)));
        }
    }

    function openBarcodeScanner() {
        onClose();
        router.push({ pathname: '/barcode', params: { date, meal } });
    }

    return (
        <BottomSheetModal visible={visible} onRequestClose={onClose}>
            <SectionHeader title="Add food" description={formatDateOnlyForDisplay(date)} />

            {isDayComplete && (
                <AppText variant="muted">This day is marked done. Reopen it from Log before adding more food.</AppText>
            )}

            <AppText variant="label">Meal</AppText>
            <View style={styles.chips}>
                {MEAL_OPTIONS.map((option) => (
                    <AppChip
                        key={option}
                        label={formatMealChipLabel(option)}
                        selected={option === meal}
                        onPress={() => setMeal(option)}
                    />
                ))}
            </View>

            <View style={styles.section}>
                <SectionHeader title="Manual entry" />
                <TextField label="Food name" value={name} onChangeText={setName} editable={!isDayComplete} />
                <NumberStepperField label="Calories" value={calories} onChangeText={setCalories} step={25} min={0} suffix="kcal" />
                {addFood.error && <AppText style={styles.error}>{addFood.error.message}</AppText>}
                <AppButton
                    title={addFood.isPending ? 'Adding...' : 'Add food'}
                    disabled={!canAdd || addFood.isPending}
                    leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                    onPress={() => addFood.mutate()}
                />
            </View>

            <View style={styles.section}>
                <SectionHeader title="Search or scan" />
                <TextField label="Search foods" value={query} onChangeText={setQuery} returnKeyType="search" editable={!isDayComplete} />
                <NumberStepperField label="Servings" value={servings} onChangeText={setServings} step={0.5} min={0.5} />
                {searchError && <AppText style={styles.error}>{searchError}</AppText>}
                <View style={styles.row}>
                    <AppButton
                        title={searchFood.isPending ? 'Searching...' : 'Search'}
                        disabled={isDayComplete || !query.trim() || searchFood.isPending}
                        leftIcon={<Ionicons name="search" size={18} color="#ffffff" />}
                        onPress={() => searchFood.mutate()}
                        style={styles.rowButton}
                    />
                    <AppButton
                        title="Scan"
                        variant="secondary"
                        disabled={isDayComplete}
                        leftIcon={<Ionicons name="barcode-outline" size={18} color={colors.text} />}
                        onPress={openBarcodeScanner}
                        style={styles.rowButton}
                    />
                </View>
                {(searchFood.data?.items ?? []).slice(0, 3).map((result) => (
                    <View key={`${result.source ?? 'food'}-${result.id}`} style={styles.searchResult}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Use ${result.name} in manual entry`}
                            onPress={() => applySearchResult(result)}
                            style={({ pressed }) => [styles.searchText, pressed && styles.pressed]}
                        >
                            <AppText variant="body" numberOfLines={1}>{result.name}</AppText>
                            <AppText variant="caption" numberOfLines={1}>{result.brand ?? result.servingSize ?? 'Food provider result'}</AppText>
                        </Pressable>
                        <View style={styles.searchActions}>
                            <AppText variant="label">{foodResultCalories(result)}</AppText>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Log ${result.name}`}
                                disabled={isDayComplete || logSearchResult.isPending}
                                onPress={() => logSearchResult.mutate(result)}
                                style={({ pressed }) => [styles.smallAddButton, (isDayComplete || logSearchResult.isPending) && styles.disabledButton, pressed && styles.pressed]}
                            >
                                <Ionicons name="add" size={18} color="#ffffff" />
                            </Pressable>
                        </View>
                    </View>
                ))}
            </View>

            <View style={styles.section}>
                <SectionHeader title="Recent and saved" />
                <View style={styles.quickGrid}>
                    {(recentFoodsQuery.data?.items ?? []).slice(0, 3).map((recent) => (
                        <QuickFoodButton
                            key={recent.id}
                            title={recent.name}
                            subtitle={`${formatCalories(recent.calories)} | ${recent.times_logged}x`}
                            disabled={isDayComplete || logRecentFood.isPending}
                            onPress={() => logRecentFood.mutate(recent)}
                        />
                    ))}
                    {(myFoodsQuery.data ?? []).slice(0, 3).map((item) => (
                        <QuickFoodButton
                            key={`my-food-${item.id}`}
                            title={item.name}
                            subtitle={`${item.type === 'RECIPE' ? 'Recipe' : 'Food'} | ${formatCalories(item.calories_per_serving)}`}
                            disabled={isDayComplete || logMyFood.isPending}
                            onPress={() => logMyFood.mutate(item)}
                        />
                    ))}
                </View>
                {recentFoodsQuery.data?.items.length === 0 && myFoodsQuery.data?.length === 0 && (
                    <AppText variant="muted">Log foods or create saved foods to reuse them here.</AppText>
                )}
            </View>
        </BottomSheetModal>
    );
};

type QuickFoodButtonProps = {
    title: string;
    subtitle: string;
    disabled?: boolean;
    onPress: () => void;
};

const QuickFoodButton: React.FC<QuickFoodButtonProps> = ({ title, subtitle, disabled, onPress }) => (
    <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.quickFood, disabled && styles.disabledButton, pressed && styles.pressed]}
    >
        <AppText variant="body" numberOfLines={1}>{title}</AppText>
        <AppText variant="caption" numberOfLines={1}>{subtitle}</AppText>
    </Pressable>
);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    section: {
        gap: spacing.md
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    quickGrid: {
        gap: spacing.sm
    },
    quickFood: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md,
        gap: spacing.xs
    },
    searchResult: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md
    },
    searchText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    searchActions: {
        alignItems: 'flex-end',
        gap: spacing.sm
    },
    smallAddButton: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary
    },
    disabledButton: {
        opacity: 0.45
    },
    pressed: {
        opacity: 0.82
    },
    error: {
        color: colors.danger
    }
});
