import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodLogCreatePayload, MyFoodSummary, RecentFoodSummary } from '@calibrate/api-client';
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
import { selectQuickRecentFoods } from '../utils/myFoods';
import {
    buildSearchedFoodLogPayload,
    calculateFoodServing,
    getPreferredFoodMeasureIndex,
    normalizeSearchedFoodItem,
    type SearchedFoodItem
} from '../food/serving';
import { colors, radius, spacing } from '../theme';

type AddFoodSheetProps = {
    visible: boolean;
    date: string;
    initialMeal?: MealPeriod | null;
    onClose: () => void;
    onLogged?: () => void;
};

type AddFoodMode = 'quick' | 'search' | 'recipes';
type SavedFoodLogRequest = { item: MyFoodSummary; servings: number };

const ADD_FOOD_MODES: Array<{ value: AddFoodMode; label: string }> = [
    { value: 'quick', label: 'Quick' },
    { value: 'search', label: 'Search' },
    { value: 'recipes', label: 'Recipes' }
];

const SERVINGS_STEP = 0.1; // Food servings match the PWA precision and provider serving snapshots.
const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_RECIPE_LIMIT = 6;
const DEFAULT_PINNED_LIMIT = 6;
const ADD_FOOD_MODE_MIN_HEIGHT = 360; // Stabilizes the sheet while switching between Quick, Search, and Recipes.

function parsePositiveServings(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function describeSearchedFood(item: SearchedFoodItem): string {
    const preferredIndex = getPreferredFoodMeasureIndex(item);
    const measure = preferredIndex === null ? null : item.measures[preferredIndex];
    const calculation = measure ? calculateFoodServing(item, measure, 1) : null;
    return [
        item.brand,
        measure ? `${measure.label} (${measure.gramWeight} g)` : 'No usable serving measure',
        calculation ? formatCalories(calculation.calories) : 'Calories unavailable'
    ].filter(Boolean).join(' | ');
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
    const [searchQuantity, setSearchQuantity] = useState('1');
    const [query, setQuery] = useState('');
    const [recipeQuery, setRecipeQuery] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const [selectedSearchItem, setSelectedSearchItem] = useState<SearchedFoodItem | null>(null);
    const [selectedMeasureIndex, setSelectedMeasureIndex] = useState('0');
    const [isMeasureSelectorOpen, setIsMeasureSelectorOpen] = useState(false);
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
    const quickRecentFoodsQuery = useQuery({
        queryKey: ['mobile-recent-foods', 'quick'],
        queryFn: () => api.getRecentFoods({ limit: DEFAULT_RECENT_LIMIT }),
        enabled: visible && mode === 'quick'
    });
    const myFoodsQuery = useQuery({
        queryKey: ['mobile-my-foods'],
        queryFn: () => api.getMyFoods(),
        enabled: visible && (mode === 'quick' || mode === 'recipes')
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
            setIsMeasureSelectorOpen(false);
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
        mutationFn: ({ item, servings: requestedServings }: SavedFoodLogRequest) =>
            createFoodLog({
                date,
                meal_period: meal,
                my_food_id: item.id,
                servings_consumed: requestedServings
            }),
        onSuccess: () => confirmLogged(true)
    });

    const logSearchResult = useMutation({
        mutationFn: (payload: FoodLogCreatePayload) => createFoodLog(payload),
        onSuccess: () => {
            setSelectedSearchItem(null);
            setSearchQuantity('1');
            return confirmLogged(true);
        }
    });

    const searchFood = useMutation({
        mutationFn: () => api.searchFood(query),
        onSuccess: () => {
            setSearchError(null);
            setSelectedSearchItem(null);
            setIsMeasureSelectorOpen(false);
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
    const searchResults = useMemo(
        () => (searchFood.data?.items ?? [])
            .map(normalizeSearchedFoodItem)
            .filter((item): item is SearchedFoodItem => item !== null),
        [searchFood.data?.items]
    );
    const selectedMeasure = selectedSearchItem?.measures[Number(selectedMeasureIndex)] ?? null;
    const parsedSearchQuantity = Number(searchQuantity);
    const selectedServingCalculation = selectedSearchItem && selectedMeasure
        ? calculateFoodServing(selectedSearchItem, selectedMeasure, parsedSearchQuantity)
        : null;
    const selectedServingPayload = selectedSearchItem
        ? buildSearchedFoodLogPayload({
              item: selectedSearchItem,
              measure: selectedMeasure,
              quantity: parsedSearchQuantity,
              date,
              meal
          })
        : null;
    const savedFoods = myFoodsQuery.data ?? [];
    const pinnedFoods = savedFoods.filter((item) => item.is_pinned).slice(0, DEFAULT_PINNED_LIMIT);
    const quickRecentFoods = selectQuickRecentFoods(
        quickRecentFoodsQuery.data?.items ?? [],
        pinnedFoods,
        DEFAULT_RECENT_LIMIT
    );
    const recipes = savedFoods.filter((item) => item.type === 'RECIPE');
    const recipeSearchText = recipeQuery.trim().toLowerCase();
    const visibleRecipes = recipes
        .filter((item) => !recipeSearchText || item.name.toLowerCase().includes(recipeSearchText))
        .slice(0, DEFAULT_RECIPE_LIMIT);

    function openBarcodeScanner() {
        onClose();
        router.push({ pathname: '/barcode', params: { date, meal } });
    }

    function selectSearchItem(item: SearchedFoodItem) {
        const preferredMeasureIndex = getPreferredFoodMeasureIndex(item);
        setSelectedSearchItem(item);
        setSelectedMeasureIndex(String(preferredMeasureIndex ?? 0));
        setSearchQuantity('1');
        setSearchError(null);
        setIsMeasureSelectorOpen(false);
    }

    function renderModeContent() {
        if (mode === 'quick') {
            return (
                <View style={styles.section}>
                    {(pinnedFoods.length > 0 || quickRecentFoods.length > 0) && (
                        <View style={styles.list}>
                            {pinnedFoods.length > 0 && <AppText variant="label">Pinned</AppText>}
                            {pinnedFoods.map((item) => (
                                <FoodActionRow
                                    key={`pinned-${item.id}`}
                                    title={item.name}
                                    subtitle={`${formatCalories(item.calories_per_serving)} per ${item.serving_size_quantity} ${item.serving_unit_label}`}
                                    disabled={isDayComplete || isSubmitting}
                                    onPress={() => logMyFood.mutate({ item, servings: 1 })}
                                />
                            ))}
                            {quickRecentFoods.length > 0 && <AppText variant="label">Recent</AppText>}
                            {quickRecentFoods.map((recent) => (
                                <FoodActionRow
                                    key={`quick-recent-${recent.id}`}
                                    title={recent.name}
                                    subtitle={`${formatCalories(recent.calories)} | ${recent.times_logged}x`}
                                    disabled={isDayComplete || isSubmitting}
                                    onPress={() => logRecentFood.mutate(recent)}
                                />
                            ))}
                        </View>
                    )}
                    {(myFoodsQuery.isLoading || quickRecentFoodsQuery.isLoading) && (
                        <AppText variant="muted">Loading pinned and recent foods...</AppText>
                    )}
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
            const measureOptions: Array<OverlaySelectOption<string>> = selectedSearchItem
                ? selectedSearchItem.measures.map((measure, index) => ({
                      value: String(index),
                      label: measure.label,
                      description: `${measure.gramWeight} g per measure`
                  }))
                : [];
            let searchedFoodLogTitle = 'Log food';
            if (logSearchResult.isPending) {
                searchedFoodLogTitle = 'Logging...';
            } else if (selectedServingCalculation) {
                searchedFoodLogTitle = `Log ${formatCalories(selectedServingCalculation.calories)}`;
            }
            const hasQuery = query.trim().length > 0;
            const hasResults = recentFoodMatches.length > 0 || searchResults.length > 0;
            return (
                <View style={styles.section}>
                    <TextField
                        label="Search foods"
                        value={query}
                        onChangeText={(value) => {
                            setQuery(value);
                            setSelectedSearchItem(null);
                            setIsMeasureSelectorOpen(false);
                        }}
                        returnKeyType="search"
                        editable={!isDayComplete && !isSubmitting}
                        onSubmitEditing={() => {
                            if (query.trim()) searchFood.mutate();
                        }}
                    />
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
                    {selectedSearchItem && (
                        <View style={styles.servingCard}>
                            <View style={styles.servingHeader}>
                                <View style={styles.foodText}>
                                    <AppText variant="subtitle" numberOfLines={2}>{selectedSearchItem.name}</AppText>
                                    {selectedSearchItem.brand && <AppText variant="caption">{selectedSearchItem.brand}</AppText>}
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Clear ${selectedSearchItem.name} selection`}
                                    onPress={() => setSelectedSearchItem(null)}
                                    style={({ pressed }) => [styles.clearSelection, pressed && styles.pressed]}
                                >
                                    <Ionicons name="close" size={19} color={colors.muted} />
                                </Pressable>
                            </View>

                            {measureOptions.length > 0 && (
                                <View style={styles.section}>
                                    <AppText variant="label">Measure</AppText>
                                    <OverlaySelect
                                        accessibilityLabel="Select food measure"
                                        value={selectedMeasureIndex}
                                        options={measureOptions}
                                        isOpen={isMeasureSelectorOpen}
                                        onToggle={() => setIsMeasureSelectorOpen((current) => !current)}
                                        onChange={(nextIndex) => {
                                            setSelectedMeasureIndex(nextIndex);
                                            setIsMeasureSelectorOpen(false);
                                        }}
                                    />
                                </View>
                            )}
                            <NumberStepperField
                                label="Quantity"
                                value={searchQuantity}
                                onChangeText={setSearchQuantity}
                                step={SERVINGS_STEP}
                                min={SERVINGS_STEP}
                                editable={!isDayComplete && !isSubmitting && measureOptions.length > 0}
                            />

                            {selectedServingCalculation && selectedMeasure && (
                                <View
                                    accessible
                                    accessibilityLiveRegion="polite"
                                    accessibilityLabel={`${formatCalories(selectedServingCalculation.calories)}, ${selectedServingCalculation.gramsTotal} grams total`}
                                    style={styles.servingSummary}
                                >
                                    <AppText variant="subtitle">{formatCalories(selectedServingCalculation.calories)}</AppText>
                                    <AppText variant="caption">
                                        {searchQuantity} x {selectedMeasure.label} | {selectedServingCalculation.gramsTotal} g total
                                    </AppText>
                                </View>
                            )}
                            {selectedServingPayload && !selectedServingPayload.ok && (
                                <AppText accessibilityRole="alert" style={styles.error}>{selectedServingPayload.message}</AppText>
                            )}
                            {logSearchResult.error && (
                                <AppText accessibilityRole="alert" style={styles.error}>{logSearchResult.error.message}</AppText>
                            )}
                            <AppButton
                                title={searchedFoodLogTitle}
                                disabled={isDayComplete || isSubmitting || !selectedServingPayload?.ok}
                                leftIcon={<Ionicons name="add" size={18} color={selectedServingPayload?.ok ? colors.surface : colors.muted} />}
                                onPress={() => {
                                    if (selectedServingPayload?.ok) {
                                        logSearchResult.mutate(selectedServingPayload.payload);
                                    }
                                }}
                                accessibilityLabel={`Log ${selectedSearchItem.name}`}
                            />
                        </View>
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
                        {searchResults.length > 0 && <AppText variant="label">Search results</AppText>}
                        {searchResults.slice(0, 8).map((result) => (
                            <FoodActionRow
                                key={`${result.source ?? 'food'}-${result.id}`}
                                title={result.name}
                                subtitle={describeSearchedFood(result)}
                                accessibilityLabel={`Choose serving for ${result.name}`}
                                icon="chevron-forward"
                                disabled={isDayComplete || isSubmitting}
                                onPress={() => selectSearchItem(result)}
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
                            onPress={() => logMyFood.mutate({ item, servings: parsePositiveServings(servings) })}
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
                    setIsMeasureSelectorOpen(false);
                }}
            />
            <View style={styles.modeContent}>{renderModeContent()}</View>
        </BottomSheetModal>
    );
};

type FoodActionRowProps = {
    title: string;
    subtitle: string;
    accessibilityLabel?: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    disabled?: boolean;
    onPress: () => void;
};

const FoodActionRow: React.FC<FoodActionRowProps> = ({
    title,
    subtitle,
    accessibilityLabel,
    icon = 'add',
    disabled,
    onPress
}) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.foodRow, disabled && styles.disabledButton, pressed && styles.pressed]}
    >
        <View style={styles.foodText}>
            <AppText variant="body" numberOfLines={1}>{title}</AppText>
            <AppText variant="caption" numberOfLines={1}>{subtitle}</AppText>
        </View>
        <View style={styles.addIcon}>
            <Ionicons name={icon} size={18} color="#ffffff" />
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
    servingCard: {
        gap: spacing.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md
    },
    servingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    clearSelection: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.surface
    },
    servingSummary: {
        gap: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft,
        padding: spacing.md
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
