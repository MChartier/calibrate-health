import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { SegmentedControl } from './SegmentedControl';
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

type AddFoodMode = 'quick' | 'search' | 'saved';

const ADD_FOOD_MODES: Array<{ value: AddFoodMode; label: string }> = [
    { value: 'quick', label: 'Manual' },
    { value: 'search', label: 'Search' },
    { value: 'saved', label: 'Saved' }
];

const SERVINGS_STEP = 0.1; // Food servings match the PWA precision and provider serving snapshots.
const DEFAULT_RECENT_LIMIT = 8;
const DEFAULT_SAVED_LIMIT = 8;

function foodResultCalories(result: FoodSearchResult): string {
    return typeof result.calories === 'number' ? formatCalories(result.calories) : 'Calories not listed';
}

function parsePositiveServings(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Choose the same time-aware default meal used by the PWA add-food dialog.
 */
function getDefaultMealPeriodForTime(now: Date): MealPeriod {
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    if (minutesSinceMidnight >= 21 * 60) return MEAL_PERIODS.EVENING_SNACK;
    if (minutesSinceMidnight >= 16 * 60 + 30) return MEAL_PERIODS.DINNER;
    if (minutesSinceMidnight >= 14 * 60) return MEAL_PERIODS.AFTERNOON_SNACK;
    if (minutesSinceMidnight >= 11 * 60 + 30) return MEAL_PERIODS.LUNCH;
    if (minutesSinceMidnight >= 9 * 60) return MEAL_PERIODS.MORNING_SNACK;
    return MEAL_PERIODS.BREAKFAST;
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

function buildRecentFoodPayload(
    recent: RecentFoodSummary,
    date: string,
    meal: MealPeriod
): FoodLogCreatePayload {
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
 *
 * The first tab is intentionally labeled Manual because it is a direct entry
 * form; recent and reusable foods live under Saved.
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
    const [mode, setMode] = useState<AddFoodMode>('quick');
    const [name, setName] = useState('');
    const [calories, setCalories] = useState('');
    const [meal, setMeal] = useState<MealPeriod>(initialMeal ?? getDefaultMealPeriodForTime(new Date()));
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
        queryFn: () => api.getRecentFoods({ limit: DEFAULT_RECENT_LIMIT }),
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
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] })
        ]);
    }

    async function confirmLogged(closeDialog: boolean) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await invalidateLogQueries();
        onLogged?.();
        if (closeDialog) {
            onClose();
        }
    }

    const addFood = useMutation({
        mutationFn: (closeDialog: boolean) =>
            api.createFoodLog({
                date,
                meal_period: meal,
                name: name.trim(),
                calories: Number(calories)
            }).then(() => closeDialog),
        onSuccess: async (closeDialog) => {
            setName('');
            setCalories('');
            await confirmLogged(closeDialog);
        }
    });

    const logRecentFood = useMutation({
        mutationFn: (recent: RecentFoodSummary) =>
            api.createFoodLog(buildRecentFoodPayload(recent, date, meal)),
        onSuccess: () => confirmLogged(true)
    });

    const logMyFood = useMutation({
        mutationFn: (item: MyFoodSummary) =>
            api.createFoodLog({
                date,
                meal_period: meal,
                my_food_id: item.id,
                servings_consumed: parsePositiveServings(servings)
            }),
        onSuccess: () => confirmLogged(true)
    });

    const logSearchResult = useMutation({
        mutationFn: (result: FoodSearchResult) =>
            api.createFoodLog(buildSearchFoodPayload(result, date, meal, parsePositiveServings(servings))),
        onSuccess: () => confirmLogged(true)
    });

    const searchFood = useMutation({
        mutationFn: () => api.searchFood(query),
        onSuccess: (response) => {
            setSearchError(response.items.length === 0 ? 'No matching foods found.' : null);
        },
        onError: (error) => {
            setSearchError(error instanceof Error ? error.message : 'Food search failed.');
        }
    });

    const canAddQuick =
        !isDayComplete &&
        name.trim().length > 0 &&
        Number.isFinite(Number(calories)) &&
        Number(calories) >= 0;
    const isSubmitting =
        addFood.isPending || logRecentFood.isPending || logMyFood.isPending || logSearchResult.isPending;
    const hasValidServings = Number.isFinite(Number(servings)) && Number(servings) > 0;
    const servingsError = servings.trim().length > 0 && !hasValidServings ? 'Servings must be a positive number.' : null;
    const recentFoods = recentFoodsQuery.data?.items ?? [];
    const savedFoods = myFoodsQuery.data ?? [];
    const visibleSavedFoods = savedFoods.slice(0, DEFAULT_SAVED_LIMIT);

    function openBarcodeScanner() {
        onClose();
        router.push({ pathname: '/barcode', params: { date, meal } });
    }

    function renderModeContent() {
        if (mode === 'quick') {
            return (
                <View style={styles.section}>
                    <TextField label="Food name" value={name} onChangeText={setName} editable={!isDayComplete && !isSubmitting} />
                    <NumberStepperField
                        label="Calories"
                        value={calories}
                        onChangeText={setCalories}
                        step={25}
                        min={0}
                        suffix="kcal"
                        editable={!isDayComplete && !isSubmitting}
                    />
                    {addFood.error && <AppText style={styles.error}>{addFood.error.message}</AppText>}
                    <View style={styles.row}>
                        <AppButton
                            title={addFood.isPending ? 'Adding...' : 'Add another'}
                            variant="secondary"
                            disabled={!canAddQuick || addFood.isPending}
                            leftIcon={<Ionicons name="add" size={18} color={colors.text} />}
                            onPress={() => addFood.mutate(false)}
                            style={styles.rowButton}
                        />
                        <AppButton
                            title={addFood.isPending ? 'Adding...' : 'Add & close'}
                            disabled={!canAddQuick || addFood.isPending}
                            leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                            onPress={() => addFood.mutate(true)}
                            style={styles.rowButton}
                        />
                    </View>
                </View>
            );
        }

        if (mode === 'search') {
            const results = searchFood.data?.items ?? [];
            return (
                <View style={styles.section}>
                    <TextField
                        label="Search foods"
                        value={query}
                        onChangeText={setQuery}
                        returnKeyType="search"
                        editable={!isDayComplete && !isSubmitting}
                        onSubmitEditing={() => {
                            if (query.trim()) searchFood.mutate();
                        }}
                    />
                    <NumberStepperField
                        label="Servings"
                        value={servings}
                        onChangeText={setServings}
                        step={SERVINGS_STEP}
                        min={SERVINGS_STEP}
                        editable={!isDayComplete && !isSubmitting}
                    />
                    {servingsError && <AppText style={styles.error}>{servingsError}</AppText>}
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
                            disabled={isDayComplete || isSubmitting}
                            leftIcon={<Ionicons name="barcode-outline" size={18} color={colors.text} />}
                            onPress={openBarcodeScanner}
                            style={styles.rowButton}
                        />
                    </View>
                    {searchFood.data?.provider && (
                        <AppText variant="caption">Results from {searchFood.data.provider}</AppText>
                    )}
                    <View style={styles.list}>
                        {results.slice(0, 8).map((result) => (
                            <FoodActionRow
                                key={`${result.source ?? 'food'}-${result.id}`}
                                title={result.name}
                                subtitle={[result.brand, result.servingSize, foodResultCalories(result)].filter(Boolean).join(' | ')}
                                disabled={isDayComplete || isSubmitting || !hasValidServings}
                                onPress={() => logSearchResult.mutate(result)}
                            />
                        ))}
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.section}>
                <AppText variant="label">Recent foods</AppText>
                <View style={styles.list}>
                    {recentFoods.map((recent) => (
                        <FoodActionRow
                            key={recent.id}
                            title={recent.name}
                            subtitle={`${formatCalories(recent.calories)} | ${recent.times_logged}x`}
                            disabled={isDayComplete || isSubmitting}
                            onPress={() => logRecentFood.mutate(recent)}
                        />
                    ))}
                    {recentFoodsQuery.isLoading && <AppText variant="muted">Loading recent foods...</AppText>}
                    {!recentFoodsQuery.isLoading && recentFoods.length === 0 && (
                        <AppText variant="muted">Recently logged foods will appear here.</AppText>
                    )}
                </View>

                <NumberStepperField
                    label="Saved food servings"
                    value={servings}
                    onChangeText={setServings}
                    step={SERVINGS_STEP}
                    min={SERVINGS_STEP}
                    editable={!isDayComplete && !isSubmitting}
                />
                {servingsError && <AppText style={styles.error}>{servingsError}</AppText>}
                <AppText variant="label">Saved foods and recipes</AppText>
                <View style={styles.list}>
                    {visibleSavedFoods.map((item) => (
                        <FoodActionRow
                            key={`my-food-${item.id}`}
                            title={item.name}
                            subtitle={`${item.type === 'RECIPE' ? 'Recipe' : 'Food'} | ${formatCalories(item.calories_per_serving)}`}
                            disabled={isDayComplete || isSubmitting || !hasValidServings}
                            onPress={() => logMyFood.mutate(item)}
                        />
                    ))}
                    {myFoodsQuery.isLoading && <AppText variant="muted">Loading saved foods...</AppText>}
                    {!myFoodsQuery.isLoading && savedFoods.length === 0 && (
                        <AppText variant="muted">Create saved foods from My Foods to reuse them here.</AppText>
                    )}
                </View>
            </View>
        );
    }

    return (
        <BottomSheetModal visible={visible} onRequestClose={onClose}>
            <SectionHeader title="Add food" description={`${formatDateOnlyForDisplay(date)} | ${formatMealChipLabel(meal)}`} />

            {isDayComplete && (
                <AppText variant="muted">This day is marked done. Reopen it from Log before adding more food.</AppText>
            )}

            <View style={styles.section}>
                <AppText variant="label">Meal</AppText>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mealScroller}
                >
                    {MEAL_OPTIONS.map((option) => (
                        <AppChip
                            key={option}
                            label={formatMealChipLabel(option)}
                            selected={option === meal}
                            onPress={() => setMeal(option)}
                        />
                    ))}
                </ScrollView>
            </View>

            <SegmentedControl options={ADD_FOOD_MODES} value={mode} onChange={setMode} />
            {renderModeContent()}
        </BottomSheetModal>
    );
};

type FoodActionRowProps = {
    title: string;
    subtitle: string;
    disabled?: boolean;
    onPress: () => void;
};

const FoodActionRow: React.FC<FoodActionRowProps> = ({ title, subtitle, disabled, onPress }) => (
    <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.foodRow, disabled && styles.disabledButton, pressed && styles.pressed]}
    >
        <View style={styles.foodText}>
            <AppText variant="body" numberOfLines={1}>{title}</AppText>
            <AppText variant="caption" numberOfLines={1}>{subtitle}</AppText>
        </View>
        <View style={styles.addIcon}>
            <Ionicons name="add" size={18} color="#ffffff" />
        </View>
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
    mealScroller: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    list: {
        gap: spacing.sm
    },
    foodRow: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md
    },
    foodText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    addIcon: {
        width: 34,
        height: 34,
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
