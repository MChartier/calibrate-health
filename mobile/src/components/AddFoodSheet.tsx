import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodLogCreatePayload, MyFoodSummary, RecentFoodSummary } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from './AsyncStateBoundary';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { FoodSelectionEditor, type FoodSelectionSubmitRequest } from './FoodSelectionEditor';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import { OverlaySelect } from './OverlaySelect';
import { SegmentedControl } from './SegmentedControl';
import { TextField } from './TextField';
import { useAuth } from '../auth/AuthContext';
import { calibrationStatusQueryKey } from '../calibration/queryKeys';
import { getProviderAttribution, type ProviderAttribution } from '../barcode/workflow';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../offline/operations';
import { useOfflineOutbox } from '../offline/provider';
import { useFoodDayStatus } from './FoodTrackingStatus';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { triggerHapticFeedback } from '../utils/haptics';
import { MEAL_OPTIONS, MEAL_SELECT_OPTIONS } from '../utils/meals';
import { selectQuickRecentFoods } from '../utils/myFoods';
import { getFoodLogAmountText } from '../food/foodLogAmount';
import {
    createMyFoodSelection,
    createProviderFoodSelection,
    createRecentFoodSelection,
    isRecentFoodSelectionReady,
    type FoodLogSelection
} from '../food/foodLogSelection';
import {
    calculateFoodServing,
    getDefaultFoodMeasureQuantity,
    getPreferredFoodMeasureIndex,
    normalizeSearchedFoodItem,
    type SearchedFoodItem
} from '../food/serving';
import { radius, spacing, useAppTheme, type AppTheme } from '../theme';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { confirmDiscardChanges } from './confirmDiscardChanges';
import { ASYNC_RESOURCE_STATES, type AsyncResourceState } from '../asyncState/resolveAsyncState';

export type AddFoodReturnTo = 'today' | 'food-log';

type AddFoodSheetProps = {
    visible: boolean;
    date: string;
    initialMeal?: MealPeriod | null;
    returnTo?: AddFoodReturnTo;
    onClose: () => void;
    onLogged?: () => void;
};

type AddFoodMode = 'quick' | 'search' | 'recipes';
type FoodBrowseRow =
    | { kind: 'header'; key: string; title: string }
    | {
          kind: 'selection';
          key: string;
          title: string;
          subtitle: string;
          selection: FoodLogSelection;
          disabled?: boolean;
          disabledReason?: string;
      };

const DEFAULT_ADD_FOOD_MODE: AddFoodMode = 'search';
const ADD_FOOD_MODES: Array<{ value: AddFoodMode; label: string }> = [
    { value: 'quick', label: 'Quick' },
    { value: 'search', label: 'Search' },
    { value: 'recipes', label: 'Recipes' }
];
const SEARCH_DEBOUNCE_MS = 350;
const MINIMUM_SEARCH_LENGTH = 2;
const DEFAULT_RECENT_LIMIT = 8;
const DEFAULT_PINNED_LIMIT = 8;
const ADD_FOOD_SHEET_HEIGHT = '92%';

function describeSearchedFood(item: SearchedFoodItem): string {
    const preferredIndex = getPreferredFoodMeasureIndex(item);
    const measure = preferredIndex === null ? null : item.measures[preferredIndex];
    const defaultQuantity = getDefaultFoodMeasureQuantity(item, measure ?? null);
    const calculation = measure ? calculateFoodServing(item, measure, defaultQuantity) : null;
    return [
        item.brand,
        measure ? measure.label : 'No usable serving unit',
        calculation ? formatCalories(calculation.calories) : 'Calories unavailable'
    ].filter(Boolean).join(' | ');
}

function describeMyFood(item: MyFoodSummary): string {
    const kind = item.type === 'RECIPE' ? 'Recipe' : 'Saved food';
    return `${kind} | ${formatCalories(item.calories_per_serving)} per serving`;
}

function describeRecentFood(item: RecentFoodSummary, currentMyFood?: MyFoodSummary): string {
    const capturedAmount = getFoodLogAmountText(item);
    const amountText = capturedAmount ? ` | ${capturedAmount}` : '';
    if (currentMyFood) {
        return `${formatCalories(currentMyFood.calories_per_serving)} per serving${amountText} | logged ${item.times_logged}x`;
    }
    return `${formatCalories(item.calories)}${amountText} | logged ${item.times_logged}x`;
}

function getDefaultMealPeriodForTime(now: Date): MealPeriod {
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    if (minutesSinceMidnight >= 21 * 60) return MEAL_PERIODS.EVENING_SNACK;
    if (minutesSinceMidnight >= 16 * 60 + 30) return MEAL_PERIODS.DINNER;
    if (minutesSinceMidnight >= 14 * 60) return MEAL_PERIODS.AFTERNOON_SNACK;
    if (minutesSinceMidnight >= 11 * 60 + 30) return MEAL_PERIODS.LUNCH;
    if (minutesSinceMidnight >= 9 * 60) return MEAL_PERIODS.MORNING_SNACK;
    return MEAL_PERIODS.BREAKFAST;
}

function errorMessage(error: unknown, fallback: string): string | null {
    if (!error) return null;
    return getSafeActionErrorMessage(error, fallback);
}

function appendSection(rows: FoodBrowseRow[], title: string, items: FoodBrowseRow[]): void {
    if (items.length === 0) return;
    rows.push({ kind: 'header', key: `header:${title}`, title }, ...items);
}

export const AddFoodSheet: React.FC<AddFoodSheetProps> = ({
    visible,
    date,
    initialMeal,
    returnTo = 'today',
    onClose,
    onLogged
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const isOnline = useOnlineStatus();
    const { api, user } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const foodDayQuery = useFoodDayStatus(date, visible);
    const [mode, setMode] = useState<AddFoodMode>(DEFAULT_ADD_FOOD_MODE);
    const [meal, setMeal] = useState<MealPeriod>(initialMeal ?? getDefaultMealPeriodForTime(new Date()));
    const [quickCalories, setQuickCalories] = useState('');
    const [quickName, setQuickName] = useState('');
    const [query, setQuery] = useState('');
    const [requestedQuery, setRequestedQuery] = useState('');
    const [recipeQuery, setRecipeQuery] = useState('');
    const [selection, setSelection] = useState<FoodLogSelection | null>(null);
    const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
    const normalizedQuery = query.trim();

    useEffect(() => {
        if (!visible || mode !== 'search' || normalizedQuery.length < MINIMUM_SEARCH_LENGTH) {
            setRequestedQuery('');
            return;
        }
        const timeout = setTimeout(() => setRequestedQuery(normalizedQuery), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [mode, normalizedQuery, visible]);

    const recentFoodsQuery = useQuery({
        queryKey: ['mobile-recent-foods', requestedQuery || 'browse'],
        queryFn: () => api.getRecentFoods({
            q: requestedQuery || undefined,
            limit: DEFAULT_RECENT_LIMIT
        }),
        enabled: visible && mode === 'search'
    });
    const providerSearchQuery = useQuery({
        queryKey: ['mobile-food-search', requestedQuery],
        queryFn: () => api.searchFood(requestedQuery),
        enabled: visible && mode === 'search' && requestedQuery.length >= MINIMUM_SEARCH_LENGTH
    });
    const myFoodsQuery = useQuery({
        queryKey: ['mobile-my-foods'],
        queryFn: () => api.getMyFoods(),
        enabled: visible && (mode === 'search' || mode === 'recipes')
    });
    const recentFoodsState = useAsyncResourceState(recentFoodsQuery, (data) => data.items.length === 0);
    const providerSearchState = useAsyncResourceState(providerSearchQuery, (data) => data.items.length === 0);
    const myFoodsState = useAsyncResourceState(myFoodsQuery, (data) => data.length === 0);

    const createFoodLog = useCallback((payload: FoodLogCreatePayload) => {
        if (foodDayQuery.data?.status !== 'OPEN') {
            throw new Error('Backfill this day before adding food.');
        }
        return executeOrQueueMutation({
            operation: OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG,
            payload,
            execute: (operationId) => api.createFoodLog(payload, operationId),
            enqueue
        });
    }, [api, enqueue, foodDayQuery.data?.status]);

    async function invalidateLogQueries() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['mobile-food', date] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-food-day', date] }),
            queryClient.invalidateQueries({ queryKey: calibrationStatusQueryKey }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] })
        ]);
    }

    async function confirmLogged(closeAfterLogging: boolean) {
        triggerHapticFeedback(user?.haptics_enabled, 'success');
        onLogged?.();
        if (closeAfterLogging) onClose();
        await invalidateLogQueries();
    }

    const logFood = useMutation({
        mutationFn: async (request: FoodSelectionSubmitRequest) => {
            await createFoodLog(request.payload);
            return request.closeAfterLogging;
        },
        onSuccess: async (closeAfterLogging) => {
            setSelection(null);
            setQuickCalories('');
            setQuickName('');
            await confirmLogged(closeAfterLogging);
        }
    });

    useEffect(() => {
        if (!visible) return;
        const requestedMeal = initialMeal && MEAL_OPTIONS.includes(initialMeal)
            ? initialMeal
            : getDefaultMealPeriodForTime(new Date());
        setMode(DEFAULT_ADD_FOOD_MODE);
        setMeal(requestedMeal);
        setQuickCalories('');
        setQuickName('');
        setQuery('');
        setRequestedQuery('');
        setRecipeQuery('');
        setSelection(null);
        setIsMealSelectorOpen(false);
        logFood.reset();
    }, [initialMeal, visible]);

    const savedFoods = myFoodsQuery.data ?? [];
    const providerData = requestedQuery === normalizedQuery ? providerSearchQuery.data : undefined;
    const recentData = requestedQuery === normalizedQuery
        ? recentFoodsQuery.data
        : undefined;
    const providerResults = useMemo(
        () => (providerData?.items ?? [])
            .map(normalizeSearchedFoodItem)
            .filter((item): item is SearchedFoodItem => item !== null),
        [providerData?.items]
    );
    const searchRows = useMemo(() => {
        const rows: FoodBrowseRow[] = [];
        const recentFoods = recentData?.items ?? [];
        const createRecentRow = (item: RecentFoodSummary): FoodBrowseRow => {
            const currentMyFood = savedFoods.find((savedFood) => savedFood.id === item.my_food_id);
            const isReady = isRecentFoodSelectionReady(item, currentMyFood, myFoodsQuery.isSuccess);
            const unavailableMessage = myFoodsQuery.isError
                ? 'Saved food could not be loaded.'
                : 'Loading saved food...';
            return {
                kind: 'selection',
                key: `recent:${item.id}`,
                title: item.name,
                subtitle: isReady ? describeRecentFood(item, currentMyFood) : unavailableMessage,
                selection: createRecentFoodSelection(item, currentMyFood),
                disabled: !isReady,
                disabledReason: isReady ? undefined : unavailableMessage
            };
        };
        if (normalizedQuery.length === 0) {
            const pinnedFoods = savedFoods.filter((item) => item.is_pinned).slice(0, DEFAULT_PINNED_LIMIT);
            const recentWithoutPinned = selectQuickRecentFoods(recentFoods, pinnedFoods, DEFAULT_RECENT_LIMIT);
            appendSection(rows, 'Pinned', pinnedFoods.map((item) => ({
                kind: 'selection' as const,
                key: `pinned:${item.id}`,
                title: item.name,
                subtitle: describeMyFood(item),
                selection: createMyFoodSelection(item)
            })));
            appendSection(rows, 'Recent', recentWithoutPinned.map(createRecentRow));
            return rows;
        }
        if (normalizedQuery.length < MINIMUM_SEARCH_LENGTH || requestedQuery !== normalizedQuery) return rows;

        const recentMyFoodIds = new Set(recentFoods.flatMap((item) => item.my_food_id === null ? [] : [item.my_food_id]));
        const matchingSaved = savedFoods.filter((item) => (
            item.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
            && !recentMyFoodIds.has(item.id)
        ));
        appendSection(rows, 'Recent matches', recentFoods.map(createRecentRow));
        appendSection(rows, 'Saved matches', matchingSaved.map((item) => ({
            kind: 'selection' as const,
            key: `saved:${item.id}`,
            title: item.name,
            subtitle: describeMyFood(item),
            selection: createMyFoodSelection(item)
        })));
        appendSection(rows, 'Food results', providerResults.map((item) => ({
            kind: 'selection' as const,
            key: `provider:${item.source ?? 'food'}:${item.id}`,
            title: item.name,
            subtitle: describeSearchedFood(item),
            selection: createProviderFoodSelection(item)
        })));
        return rows;
    }, [
        myFoodsQuery.isError,
        myFoodsQuery.isSuccess,
        normalizedQuery,
        providerResults,
        recentData?.items,
        requestedQuery,
        savedFoods
    ]);

    const recipes = savedFoods.filter((item) => item.type === 'RECIPE');
    const normalizedRecipeQuery = recipeQuery.trim().toLocaleLowerCase();
    const recipeRows: FoodBrowseRow[] = recipes
        .filter((item) => !normalizedRecipeQuery || item.name.toLocaleLowerCase().includes(normalizedRecipeQuery))
        .map((item) => ({
            kind: 'selection',
            key: `recipe:${item.id}`,
            title: item.name,
            subtitle: describeMyFood(item),
            selection: createMyFoodSelection(item)
        }));
    const activeAttribution = getProviderAttribution(providerData?.provider, providerData?.attribution);
    const isWaitingForSearch = normalizedQuery.length >= MINIMUM_SEARCH_LENGTH && requestedQuery !== normalizedQuery;
    const isSearchLoading = isWaitingForSearch
        || (requestedQuery === normalizedQuery && (providerSearchQuery.isFetching || recentFoodsQuery.isFetching));
    const mutationError = errorMessage(logFood.error, 'Food could not be added. Try again.');
    const hasUnsavedDraft = Boolean(selection || quickCalories.trim() || quickName.trim());
    const canAddQuickEntry = quickCalories.trim().length > 0
        && Number.isFinite(Number(quickCalories))
        && Number(quickCalories) >= 0;

    function openBarcodeScanner() {
        onClose();
        router.push({ pathname: '/barcode', params: { date, meal, returnTo } });
    }

    function openSavedFoods() {
        onClose();
        router.push('/my-foods');
    }

    function submitQuick(closeAfterLogging: boolean) {
        if (!canAddQuickEntry) return;
        logFood.mutate({
            closeAfterLogging,
            payload: {
                date,
                meal_period: meal,
                name: quickName.trim() || 'Quick entry',
                calories: Math.round(Number(quickCalories))
            }
        });
    }

    function selectMode(nextMode: AddFoodMode) {
        setMode(nextMode);
        setSelection(null);
        setIsMealSelectorOpen(false);
        logFood.reset();
    }

    function renderBrowseRow({ item }: { item: FoodBrowseRow }) {
        if (item.kind === 'header') {
            return <AppText style={styles.listHeader} variant="label">{item.title}</AppText>;
        }
        return (
            <FoodActionRow
                title={item.title}
                subtitle={item.subtitle}
                disabled={logFood.isPending || item.disabled}
                disabledReason={item.disabledReason}
                onPress={() => {
                    logFood.reset();
                    setSelection(item.selection);
                }}
            />
        );
    }

    function renderSelectionEditor() {
        if (!selection) return null;
        const selectionAttribution = selection.kind === 'provider'
            ? getProviderAttribution(selection.item.source ?? undefined, providerData?.attribution)
            : null;
        return (
            <KeyboardAwareScrollView
                style={styles.flex}
                contentContainerStyle={styles.editorContent}
                keyboardShouldPersistTaps="handled"
            >
                {selectionAttribution && renderProviderAttribution(selectionAttribution)}
                <FoodSelectionEditor
                    selection={selection}
                    date={date}
                    meal={meal}
                    isSubmitting={logFood.isPending}
                    error={mutationError}
                    onCancel={() => {
                        setSelection(null);
                        logFood.reset();
                    }}
                    onSubmit={(request) => logFood.mutate(request)}
                />
            </KeyboardAwareScrollView>
        );
    }

    function renderProviderAttribution(attribution: ProviderAttribution) {
        return (
            <AppText
                accessibilityRole={attribution.url ? 'link' : undefined}
                accessibilityHint={attribution.url ? 'Opens the food provider website.' : undefined}
                onPress={attribution.url ? () => void Linking.openURL(attribution.url!) : undefined}
                style={attribution.url ? styles.attributionLink : undefined}
                variant="caption"
            >
                {attribution.text}
            </AppText>
        );
    }

    function renderSearchEmpty(): React.ReactElement | null {
        const providerSearchIsActive = requestedQuery === normalizedQuery
            && requestedQuery.length >= MINIMUM_SEARCH_LENGTH;
        const relevantStates = providerSearchIsActive
            ? [recentFoodsState, myFoodsState, providerSearchState]
            : [recentFoodsState, myFoodsState];
        if (relevantStates.some((state) => state.kind === ASYNC_RESOURCE_STATES.ERROR)) return null;

        let message = 'Pinned and recent foods will appear here after you log them.';
        if (normalizedQuery.length === 1) message = 'Type at least 2 characters to search.';
        if (
            isSearchLoading
            || relevantStates.some((state) => state.kind === ASYNC_RESOURCE_STATES.LOADING)
        ) {
            message = normalizedQuery.length >= MINIMUM_SEARCH_LENGTH
                ? 'Searching foods...'
                : 'Loading pinned and recent foods...';
        }
        if (
            normalizedQuery.length >= MINIMUM_SEARCH_LENGTH
            && !isSearchLoading
            && relevantStates.every((state) => state.kind !== ASYNC_RESOURCE_STATES.LOADING)
            && requestedQuery === normalizedQuery
        ) {
            message = 'No matching foods found.';
        }
        return <AppText style={styles.emptyMessage} variant="muted">{message}</AppText>;
    }

    function renderResourceFeedback(
        state: AsyncResourceState,
        resourceLabel: string,
        retrying: boolean,
        onRetry: () => unknown
    ) {
        if (
            state.kind !== ASYNC_RESOURCE_STATES.ERROR
            && state.kind !== ASYNC_RESOURCE_STATES.STALE
            && state.kind !== ASYNC_RESOURCE_STATES.DEGRADED
        ) return null;

        return (
            <AsyncStateBoundary
                state={state}
                resourceLabel={resourceLabel}
                loading={null}
                empty={null}
                onRetry={isOnline ? onRetry : undefined}
                retrying={retrying}
            >
                {null}
            </AsyncStateBoundary>
        );
    }

    function renderSearchFeedback() {
        const providerSearchIsActive = requestedQuery === normalizedQuery
            && requestedQuery.length >= MINIMUM_SEARCH_LENGTH;
        return (
            <>
                {renderResourceFeedback(
                    recentFoodsState,
                    'recent foods',
                    recentFoodsQuery.isFetching,
                    () => recentFoodsQuery.refetch()
                )}
                {renderResourceFeedback(
                    myFoodsState,
                    'saved foods',
                    myFoodsQuery.isFetching,
                    () => myFoodsQuery.refetch()
                )}
                {providerSearchIsActive && renderResourceFeedback(
                    providerSearchState,
                    'food search',
                    providerSearchQuery.isFetching,
                    () => providerSearchQuery.refetch()
                )}
            </>
        );
    }

    function renderSearchFooter() {
        if (!activeAttribution && !isSearchLoading) return null;
        return (
            <View style={styles.listFooter}>
                {isSearchLoading && searchRows.length > 0 && <AppText variant="muted">Updating results...</AppText>}
                {activeAttribution && renderProviderAttribution(activeAttribution)}
            </View>
        );
    }

    function renderModeContent() {
        if (mode === 'quick') {
            return (
                <KeyboardAwareScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.formContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <TextField
                        label="Calories"
                        value={quickCalories}
                        onChangeText={setQuickCalories}
                        autoFocus
                        keyboardType="decimal-pad"
                        placeholder="0"
                        editable={!logFood.isPending}
                    />
                    <TextField
                        label="Food name (optional)"
                        value={quickName}
                        onChangeText={setQuickName}
                        placeholder="Quick entry"
                        editable={!logFood.isPending}
                    />
                    {!canAddQuickEntry && quickCalories.trim().length > 0 && (
                        <AppText accessibilityRole="alert" style={styles.error}>Calories must be zero or greater.</AppText>
                    )}
                    {mutationError && <AppText accessibilityRole="alert" style={styles.error}>{mutationError}</AppText>}
                    <View style={styles.actions}>
                        <AppButton
                            title={logFood.isPending ? 'Adding...' : 'Add another'}
                            variant="secondary"
                            disabled={!canAddQuickEntry || logFood.isPending}
                            leftIcon={<Ionicons name="add" size={18} color={theme.colors.onSurface} />}
                            onPress={() => submitQuick(false)}
                            style={styles.actionButton}
                        />
                        <AppButton
                            title={logFood.isPending ? 'Adding...' : 'Add & close'}
                            disabled={!canAddQuickEntry || logFood.isPending}
                            leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                            onPress={() => submitQuick(true)}
                            style={styles.actionButton}
                        />
                    </View>
                </KeyboardAwareScrollView>
            );
        }

        if (mode === 'search') {
            return (
                <View style={styles.flex}>
                    <View style={styles.searchControls}>
                        <TextField
                            label="Search foods"
                            value={query}
                            onChangeText={(value) => {
                                setQuery(value);
                                setSelection(null);
                                logFood.reset();
                            }}
                            returnKeyType="search"
                            editable={!logFood.isPending}
                            onSubmitEditing={() => {
                                if (normalizedQuery.length >= MINIMUM_SEARCH_LENGTH) {
                                    setRequestedQuery(normalizedQuery);
                                }
                            }}
                            containerStyle={styles.searchField}
                        />
                        <AppButton
                            title="Scan"
                            variant="secondary"
                            disabled={logFood.isPending}
                            leftIcon={<Ionicons name="barcode-outline" size={18} color={theme.colors.onSurface} />}
                            onPress={openBarcodeScanner}
                            style={styles.scanButton}
                        />
                    </View>
                    {selection ? renderSelectionEditor() : (
                        <FlatList
                            testID="food-search-results"
                            tabIndex={Platform.OS === 'web' ? 0 : undefined}
                            data={searchRows}
                            keyExtractor={(item) => item.key}
                            renderItem={renderBrowseRow}
                            ListHeaderComponent={renderSearchFeedback}
                            ListEmptyComponent={renderSearchEmpty}
                            ListFooterComponent={renderSearchFooter}
                            contentContainerStyle={styles.resultsContent}
                            keyboardDismissMode="none"
                            keyboardShouldPersistTaps="always"
                            showsVerticalScrollIndicator
                            style={styles.resultsList}
                        />
                    )}
                </View>
            );
        }

        return (
            <View style={styles.flex}>
                <TextField
                    label="Search recipes"
                    value={recipeQuery}
                    onChangeText={(value) => {
                        setRecipeQuery(value);
                        setSelection(null);
                        logFood.reset();
                    }}
                    placeholder="e.g. chili, overnight oats"
                    editable={!logFood.isPending}
                />
                {selection ? renderSelectionEditor() : (
                    <AsyncStateBoundary
                        state={myFoodsState}
                        resourceLabel="saved recipes"
                        loading={<AppText style={styles.emptyMessage} variant="muted">Loading recipes...</AppText>}
                        empty={(
                            <AppText style={styles.emptyMessage} variant="muted">
                                No saved recipes yet. Create one in Saved foods to reuse it here.
                            </AppText>
                        )}
                        onRetry={isOnline ? () => myFoodsQuery.refetch() : undefined}
                        retrying={myFoodsQuery.isFetching}
                    >
                        <FlatList
                            data={recipeRows}
                            keyExtractor={(item) => item.key}
                            renderItem={renderBrowseRow}
                            ListEmptyComponent={(
                                <AppText style={styles.emptyMessage} variant="muted">
                                    No recipes match this search.
                                </AppText>
                            )}
                            contentContainerStyle={styles.resultsContent}
                            keyboardDismissMode="none"
                            keyboardShouldPersistTaps="always"
                            showsVerticalScrollIndicator
                            style={styles.resultsList}
                        />
                    </AsyncStateBoundary>
                )}
            </View>
        );
    }

    return (
        <BottomSheetModal
            visible={visible}
            accessibilityLabel="Add food"
            title="Add food"
            description={`${formatDateOnlyForDisplay(date)} | ${formatMealPeriod(meal)}`}
            maxHeight={ADD_FOOD_SHEET_HEIGHT}
            size="wide"
            showCloseButton
            scrollable={false}
            dismissDisabled={logFood.isPending}
            isDirty={hasUnsavedDraft}
            confirmDismiss={confirmDiscardChanges}
            onRequestClose={onClose}
        >
            <View style={styles.mealControl}>
                <AppText variant="label">Meal</AppText>
                <OverlaySelect
                    accessibilityLabel="Select meal"
                    value={meal}
                    options={MEAL_SELECT_OPTIONS}
                    isOpen={isMealSelectorOpen}
                    onToggle={() => setIsMealSelectorOpen((current) => !current)}
                    onChange={(nextMeal) => {
                        setMeal(nextMeal);
                        setIsMealSelectorOpen(false);
                    }}
                />
            </View>
            <SegmentedControl accessibilityLabel="Add food method" options={ADD_FOOD_MODES} value={mode} onChange={selectMode} />
            <AppButton
                title="Saved foods"
                variant="ghost"
                leftIcon={<Ionicons name="bookmark-outline" size={18} color={theme.colors.onSurface} />}
                onPress={openSavedFoods}
                style={styles.savedFoodsLink}
            />
            <View style={styles.modeContent}>{renderModeContent()}</View>
        </BottomSheetModal>
    );
};

type FoodActionRowProps = {
    title: string;
    subtitle: string;
    disabled?: boolean;
    disabledReason?: string;
    onPress: () => void;
};

const FoodActionRow: React.FC<FoodActionRowProps> = ({
    title,
    subtitle,
    disabled,
    disabledReason,
    onPress
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose amount for ${title}`}
            accessibilityHint={disabled ? disabledReason : undefined}
            accessibilityState={{ disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.foodRow, disabled && styles.disabled, pressed && styles.pressed]}
        >
            <View style={styles.foodText}>
                <AppText variant="body" numberOfLines={1}>{title}</AppText>
                <AppText variant="caption" numberOfLines={2}>{subtitle}</AppText>
            </View>
            <View style={styles.rowIcon}>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.onPrimary} />
            </View>
        </Pressable>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    flex: {
        flex: 1,
        minHeight: 0
    },
    mealControl: {
        gap: spacing.sm
    },
    modeContent: {
        flex: 1,
        minHeight: 0
    },
    savedFoodsLink: {
        alignSelf: 'flex-end'
    },
    formContent: {
        gap: spacing.md,
        paddingBottom: spacing.md
    },
    editorContent: {
        gap: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.md
    },
    searchControls: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
        paddingBottom: spacing.sm
    },
    searchField: {
        flex: 1
    },
    scanButton: {
        minWidth: 104
    },
    resultsList: {
        flex: 1,
        minHeight: 0
    },
    resultsContent: {
        gap: spacing.sm,
        paddingBottom: spacing.lg
    },
    listHeader: {
        paddingTop: spacing.sm
    },
    listFooter: {
        gap: spacing.sm,
        paddingTop: spacing.sm
    },
    emptyMessage: {
        paddingVertical: spacing.lg
    },
    foodRow: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.md
    },
    foodText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    rowIcon: {
        width: 34,
        height: 34,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    },
    disabled: {
        opacity: 0.45
    },
    pressed: {
        opacity: 0.82
    },
    error: {
        color: theme.colors.danger
    },
    attributionLink: {
        color: theme.colors.primary,
        textDecorationLine: 'underline'
    }
});
