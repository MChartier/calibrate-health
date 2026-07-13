import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodLogCreatePayload, FoodSearchResult, MyFoodSummary, RecentFoodSummary } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { NumberStepperField } from './NumberStepperField';
import { OverlaySelect, type OverlaySelectOption } from './OverlaySelect';
import { SectionHeader } from './SectionHeader';
import { SegmentedControl } from './SegmentedControl';
import { TextField } from './TextField';
import { useAuth } from '../auth/AuthContext';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../offline/operations';
import { useOfflineOutbox } from '../offline/provider';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { MEAL_OPTIONS } from '../utils/meals';
import { colors, radius, spacing } from '../theme';

type AddFoodSheetProps = {
    visible: boolean;
    date: string;
    initialMeal?: MealPeriod | null;
    onClose: () => void;
    onLogged?: () => void;
};

type AddFoodMode = 'quick' | 'search' | 'recipes';

const ADD_FOOD_MODES: Array<{ value: AddFoodMode; label: string }> = [
    { value: 'quick', label: 'Quick' },
    { value: 'search', label: 'Search' },
    { value: 'recipes', label: 'Recipes' }
];

const SERVINGS_STEP = 0.1; // Food servings match the PWA precision and provider serving snapshots.
const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_RECIPE_LIMIT = 6;
const ADD_FOOD_MODE_MIN_HEIGHT = 360; // Stabilizes the sheet while switching between Quick, Search, and Recipes.

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
 * The modes mirror the PWA's Quick, Search, and Recipes entry points while
 * keeping the native sheet focused on one logging decision at a time.
 */
export const AddFoodSheet: React.FC<AddFoodSheetProps> = ({
    visible,
    date,
    initialMeal,
    onClose,
    onLogged
}) => {
    const { api } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const [mode, setMode] = useState<AddFoodMode>('quick');
    const [name, setName] = useState('');
    const [calories, setCalories] = useState('');
    const [meal, setMeal] = useState<MealPeriod>(initialMeal ?? getDefaultMealPeriodForTime(new Date()));
    const [servings, setServings] = useState('1');
    const [query, setQuery] = useState('');
    const [recipeQuery, setRecipeQuery] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
    const foodDayQuery = useQuery({
        queryKey: ['mobile-food-day', date],
        queryFn: () => api.getFoodDay(date),
        enabled: visible
    });
    const recentFoodsQuery = useQuery({
        queryKey: ['mobile-recent-foods', query.trim()],
        queryFn: () => api.getRecentFoods({ q: query, limit: DEFAULT_RECENT_LIMIT }),
        enabled: visible && mode === 'search' && query.trim().length >= 2
    });
    const myFoodsQuery = useQuery({
        queryKey: ['mobile-my-foods'],
        queryFn: () => api.getMyFoods(),
        enabled: visible && mode === 'recipes'
    });
    const isDayComplete = foodDayQuery.data?.is_complete ?? false;

    const createFoodLog = useCallback((payload: FoodLogCreatePayload) => executeOrQueueMutation({
        operation: OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG,
        payload,
        execute: (operationId) => api.createFoodLog(payload, operationId),
        enqueue
    }), [api, enqueue]);

    useEffect(() => {
        if (visible && initialMeal && MEAL_OPTIONS.includes(initialMeal)) {
            setMeal(initialMeal);
        }
        if (visible) {
            setIsMealSelectorOpen(false);
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
            createFoodLog({
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
            createFoodLog(buildRecentFoodPayload(recent, date, meal)),
        onSuccess: () => confirmLogged(true)
    });

    const logMyFood = useMutation({
        mutationFn: (item: MyFoodSummary) =>
            createFoodLog({
                date,
                meal_period: meal,
                my_food_id: item.id,
                servings_consumed: parsePositiveServings(servings)
            }),
        onSuccess: () => confirmLogged(true)
    });

    const logSearchResult = useMutation({
        mutationFn: (result: FoodSearchResult) =>
            createFoodLog(buildSearchFoodPayload(result, date, meal, parsePositiveServings(servings))),
        onSuccess: () => confirmLogged(true)
    });

    const searchFood = useMutation({
        mutationFn: () => api.searchFood(query),
        onSuccess: () => {
            setSearchError(null);
        },
        onError: (error) => {
            setSearchError(error instanceof Error ? error.message : 'Food search failed.');
        }
    });

    const canAddQuickEntry =
        !isDayComplete &&
        name.trim().length > 0 &&
        Number.isFinite(Number(calories)) &&
        Number(calories) >= 0;
    const isSubmitting =
        addFood.isPending || logRecentFood.isPending || logMyFood.isPending || logSearchResult.isPending;
    const hasValidServings = Number.isFinite(Number(servings)) && Number(servings) > 0;
    const servingsError = servings.trim().length > 0 && !hasValidServings ? 'Servings must be a positive number.' : null;
    const recentFoodMatches = recentFoodsQuery.data?.items ?? [];
    const savedFoods = myFoodsQuery.data ?? [];
    const recipes = savedFoods.filter((item) => item.type === 'RECIPE');
    const recipeSearchText = recipeQuery.trim().toLowerCase();
    const visibleRecipes = recipes
        .filter((item) => !recipeSearchText || item.name.toLowerCase().includes(recipeSearchText))
        .slice(0, DEFAULT_RECIPE_LIMIT);

    function openBarcodeScanner() {
        onClose();
        router.push({ pathname: '/barcode', params: { date, meal } });
    }

    function renderModeContent() {
        if (mode === 'quick') {
            return (
                <View style={styles.section}>
                    <AppText variant="label">Quick entry</AppText>
                    <TextField label="Food name" value={name} onChangeText={setName} editable={!isDayComplete && !isSubmitting} />
                    <NumberStepperField
                        label="Calories"
                        value={calories}
                        onChangeText={setCalories}
                        step={25}
                        min={0}
                        suffix="kcal"
                        placeholder="0"
                        helperText={!canAddQuickEntry ? 'Enter a food name and calories to enable Add.' : undefined}
                        editable={!isDayComplete && !isSubmitting}
                    />
                    {addFood.error && <AppText style={styles.error}>{addFood.error.message}</AppText>}
                    <View style={styles.row}>
                        <AppButton
                            title={addFood.isPending ? 'Adding...' : 'Add another'}
                            variant="secondary"
                            disabled={!canAddQuickEntry || addFood.isPending}
                            leftIcon={<Ionicons name="add" size={18} color={canAddQuickEntry ? colors.text : colors.muted} />}
                            onPress={() => addFood.mutate(false)}
                            style={styles.rowButton}
                        />
                        <AppButton
                            title={addFood.isPending ? 'Adding...' : 'Add & close'}
                            disabled={!canAddQuickEntry || addFood.isPending}
                            leftIcon={<Ionicons name="checkmark" size={18} color={canAddQuickEntry ? '#ffffff' : colors.muted} />}
                            onPress={() => addFood.mutate(true)}
                            style={styles.rowButton}
                        />
                    </View>
                </View>
            );
        }

        if (mode === 'search') {
            const results = searchFood.data?.items ?? [];
            const hasQuery = query.trim().length > 0;
            const hasResults = recentFoodMatches.length > 0 || results.length > 0;
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
                        {recentFoodMatches.length > 0 && (
                            <>
                                <AppText variant="label">Recent matches</AppText>
                                {recentFoodMatches.map((recent) => (
                                    <FoodActionRow
                                        key={recent.id}
                                        title={recent.name}
                                        subtitle={`${formatCalories(recent.calories)} | ${recent.times_logged}x`}
                                        disabled={isDayComplete || isSubmitting}
                                        onPress={() => logRecentFood.mutate(recent)}
                                    />
                                ))}
                            </>
                        )}
                        {recentFoodsQuery.isLoading && <AppText variant="muted">Checking recent foods...</AppText>}
                        {results.length > 0 && <AppText variant="label">Search results</AppText>}
                        {results.slice(0, 8).map((result) => (
                            <FoodActionRow
                                key={`${result.source ?? 'food'}-${result.id}`}
                                title={result.name}
                                subtitle={[result.brand, result.servingSize, foodResultCalories(result)].filter(Boolean).join(' | ')}
                                disabled={isDayComplete || isSubmitting || !hasValidServings}
                                onPress={() => logSearchResult.mutate(result)}
                            />
                        ))}
                        {!searchFood.isPending && hasQuery && searchFood.data && !hasResults && (
                            <AppText variant="muted">No matching foods found.</AppText>
                        )}
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.section}>
                <TextField
                    label="Search recipes"
                    value={recipeQuery}
                    onChangeText={setRecipeQuery}
                    placeholder="e.g. chili, overnight oats"
                    editable={!isDayComplete && !isSubmitting}
                />
                <NumberStepperField
                    label="Recipe servings"
                    value={servings}
                    onChangeText={setServings}
                    step={SERVINGS_STEP}
                    min={SERVINGS_STEP}
                    editable={!isDayComplete && !isSubmitting}
                />
                {servingsError && <AppText style={styles.error}>{servingsError}</AppText>}
                <AppText variant="label">Recipes</AppText>
                <View style={styles.list}>
                    {visibleRecipes.map((item) => (
                        <FoodActionRow
                            key={`recipe-${item.id}`}
                            title={item.name}
                            subtitle={`${formatCalories(item.calories_per_serving)} per ${item.serving_size_quantity} ${item.serving_unit_label}`}
                            disabled={isDayComplete || isSubmitting || !hasValidServings}
                            onPress={() => logMyFood.mutate(item)}
                        />
                    ))}
                    {myFoodsQuery.isLoading && <AppText variant="muted">Loading recipes...</AppText>}
                    {!myFoodsQuery.isLoading && recipes.length === 0 && (
                        <AppText variant="muted">No saved recipes yet. Create one in My Foods to reuse it here.</AppText>
                    )}
                    {!myFoodsQuery.isLoading && recipes.length > 0 && visibleRecipes.length === 0 && (
                        <AppText variant="muted">No recipes match this search.</AppText>
                    )}
                </View>
            </View>
        );
    }

    return (
        <BottomSheetModal visible={visible} onRequestClose={onClose}>
            <SectionHeader title="Add food" description={`${formatDateOnlyForDisplay(date)} | ${formatMealPeriod(meal)}`} />

            {isDayComplete && (
                <AppText variant="muted">This day is marked done. Reopen it from Log before adding more food.</AppText>
            )}

            <View style={styles.section}>
                <AppText variant="label">Meal</AppText>
                <MealSelector
                    value={meal}
                    isOpen={isMealSelectorOpen}
                    onToggle={() => setIsMealSelectorOpen((current) => !current)}
                    onSelect={(nextMeal) => {
                        setMeal(nextMeal);
                        setIsMealSelectorOpen(false);
                    }}
                />
            </View>

            <SegmentedControl
                options={ADD_FOOD_MODES}
                value={mode}
                onChange={(nextMode) => {
                    setMode(nextMode);
                    setIsMealSelectorOpen(false);
                }}
            />
            <View style={styles.modeContent}>{renderModeContent()}</View>
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

type MealSelectorProps = {
    value: MealPeriod;
    isOpen: boolean;
    onToggle: () => void;
    onSelect: (meal: MealPeriod) => void;
};

const MEAL_SELECTOR_OPTIONS: Array<OverlaySelectOption<MealPeriod>> = MEAL_OPTIONS.map((option) => ({
    value: option,
    label: formatMealPeriod(option)
}));

const MealSelector: React.FC<MealSelectorProps> = ({ value, isOpen, onToggle, onSelect }) => (
    <OverlaySelect
        accessibilityLabel="Select meal"
        value={value}
        options={MEAL_SELECTOR_OPTIONS}
        isOpen={isOpen}
        onToggle={onToggle}
        onChange={onSelect}
    />
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
    modeContent: {
        minHeight: ADD_FOOD_MODE_MIN_HEIGHT
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
