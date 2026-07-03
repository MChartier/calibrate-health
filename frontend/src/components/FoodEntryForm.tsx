import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    LinearProgress,
    List,
    ListItemIcon,
    ListItemButton,
    ListItemText,
    ListSubheader,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import HistoryIcon from '@mui/icons-material/HistoryRounded';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import FatSecretAttributionLink from './FatSecretAttributionLink';
import FoodSearchResultsList from './FoodSearchResultsList';
import MealPeriodIcon from './MealPeriodIcon';
import NewRecipeDialog from './NewRecipeDialog';
import type { NormalizedFoodItem } from '../types/food';
import type { MyFood } from '../types/myFoods';
import { getMealPeriodLabel, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';
import { useMyFoodsQuery } from '../queries/myFoods';
import { useRecentFoodsQuery, type RecentFood } from '../queries/recentFoods';
import { getApiErrorMessage } from '../utils/apiError';
import {
    formatMeasureLabelForDisplay,
    formatMeasureLabelWithQuantity,
    getMeasureCalories,
    getPreferredMeasure,
    getPreferredMeasureLabel
} from '../utils/foodMeasure';
import { formatServingSnapshotLabel } from '../utils/servingDisplay';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useI18n } from '../i18n/useI18n';
import { haptic } from '../utils/haptics';

/**
 * Food entry form used in the log dialog.
 *
 * Supports manual calorie entries, recipe logging, and provider/recent-food search in one flow.
 */
type Props = {
    onSuccess?: (result?: { closeDialog?: boolean }) => void;
    date?: string;
    initialMealPeriod?: MealPeriod | null;
};

const SEARCH_PAGE_SIZE = 10;
const MY_FOODS_LIST_HEIGHT = { xs: 220, sm: 260 } as const; // Keeps the list usable inside the dialog without pushing actions off-screen.

type FoodSearchView = 'results' | 'selected';
type FoodEntryMode = 'food' | 'recipes';

type FoodSearchParams = {
    query?: string;
    barcode?: string;
};

const normalizeBarcodeCandidate = (value: string): string => value.replace(/\D/g, '').trim();

const isBarcodeCandidate = (value: string): boolean => {
    const digits = normalizeBarcodeCandidate(value);
    if (!digits) return false;
    return digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14;
};

/**
 * Choose a sensible default meal period based on the current local time.
 * Thresholds:
 * - 09:00 => Morning Snack
 * - 11:30 => Lunch
 * - 14:00 => Afternoon Snack
 * - 16:30 => Dinner
 * - 21:00 => Evening Snack
 * Anything earlier defaults to Breakfast.
 */
function getDefaultMealPeriodForTime(now: Date): MealPeriod {
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    if (minutesSinceMidnight >= 21 * 60) return 'EVENING_SNACK';
    if (minutesSinceMidnight >= 16 * 60 + 30) return 'DINNER';
    if (minutesSinceMidnight >= 14 * 60) return 'AFTERNOON_SNACK';
    if (minutesSinceMidnight >= 11 * 60 + 30) return 'LUNCH';
    if (minutesSinceMidnight >= 9 * 60) return 'MORNING_SNACK';
    return 'BREAKFAST';
}

/**
 * Merge paginated results without duplicating items when upstream providers repeat IDs across pages.
 */
const mergeUniqueResults = (current: NormalizedFoodItem[], nextPage: NormalizedFoodItem[]): NormalizedFoodItem[] => {
    const nextById = new Map(current.map((item) => [item.id, item]));
    nextPage.forEach((item) => nextById.set(item.id, item));
    return Array.from(nextById.values());
};

/**
 * Build a compact recent-food secondary line so repeated foods are easy to identify.
 */
const buildRecentFoodSecondaryText = (food: RecentFood): string => {
    const parts: string[] = [];
    if (food.brand_snapshot) {
        parts.push(food.brand_snapshot);
    }

    const servingLabel = formatServingSnapshotLabel({
        servingsConsumed: food.servings_consumed ?? null,
        servingSizeQuantity: food.serving_size_quantity_snapshot ?? null,
        servingUnitLabel: food.serving_unit_label_snapshot ?? null
    });
    if (servingLabel) {
        parts.push(servingLabel);
    }

    parts.push(`${Math.round(food.calories)} kcal`);
    if (food.times_logged > 1) {
        parts.push(`${food.times_logged}x`);
    }

    return parts.join(' | ');
};

const normalizeProviderKeyPart = (value?: string | null): string => value?.trim().toLowerCase() ?? '';

/**
 * Provider IDs are the most reliable bridge between "recent" snapshots and live provider results.
 * Barcode is a fallback for providers that surface an item without a stable external ID.
 */
const getRecentProviderKey = (food: RecentFood): string | null => {
    const source = normalizeProviderKeyPart(food.external_source);
    const externalId = normalizeProviderKeyPart(food.external_id);
    if (source && externalId) return `${source}:${externalId}`;

    const barcode = normalizeProviderKeyPart(food.barcode_snapshot);
    return source && barcode ? `${source}:barcode:${barcode}` : null;
};

const getProviderResultKey = (item: NormalizedFoodItem): string | null => {
    const source = normalizeProviderKeyPart(item.source);
    const externalId = normalizeProviderKeyPart(item.id);
    if (source && externalId) return `${source}:${externalId}`;

    const barcode = normalizeProviderKeyPart(item.barcode);
    return source && barcode ? `${source}:barcode:${barcode}` : null;
};

/**
 * FoodEntryForm orchestrates search, selection, and submission for a single log entry.
 */
const FoodEntryForm: React.FC<Props> = ({ onSuccess, date, initialMealPeriod = null }) => {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const [mode, setMode] = useState<FoodEntryMode>('food');

    const [quickEntryCalories, setQuickEntryCalories] = useState('');
    const [mealPeriod, setMealPeriod] = useState<MealPeriod>(() => initialMealPeriod ?? getDefaultMealPeriodForTime(new Date()));

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NormalizedFoodItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedMeasureLabel, setSelectedMeasureLabel] = useState<string | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [searchView, setSearchView] = useState<FoodSearchView>('results');
    const [searchPage, setSearchPage] = useState<number>(1);
    const [hasMoreResults, setHasMoreResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMoreResults, setIsLoadingMoreResults] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [providerName, setProviderName] = useState<string>('');
    const [supportsBarcodeLookup, setSupportsBarcodeLookup] = useState<boolean | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeSearch, setActiveSearch] = useState<FoodSearchParams | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedRecentFoodId, setSelectedRecentFoodId] = useState<string | null>(null);
    const [recentFoodServingsConsumed, setRecentFoodServingsConsumed] = useState<string>('1');
    const [selectedSearchMyFoodId, setSelectedSearchMyFoodId] = useState<number | null>(null);
    const [searchMyFoodServingsConsumed, setSearchMyFoodServingsConsumed] = useState<string>('1');

    const [isNewRecipeDialogOpen, setIsNewRecipeDialogOpen] = useState(false);

    const [myFoodsQueryText, setMyFoodsQueryText] = useState('');
    const [selectedMyFoodId, setSelectedMyFoodId] = useState<number | null>(null);
    const [myFoodServingsConsumed, setMyFoodServingsConsumed] = useState<string>('1');

    const searchSessionRef = useRef(0);
    const loadMoreLockRef = useRef(false);

    const entryLocalDate = typeof date === 'string' && date.trim().length > 0 ? date.trim() : undefined;

    const debouncedSearchQuery = useDebouncedValue(searchQuery, 350);
    const debouncedMyFoodsQueryText = useDebouncedValue(myFoodsQueryText, 250);
    const searchRecentQueryText = debouncedSearchQuery.trim();
    const quickEntryName = searchQuery.trim();

    const mealOptions = useMemo(() => {
        return MEAL_PERIOD_ORDER.map((value) => ({
            value,
            label: getMealPeriodLabel(value, t),
            icon: <MealPeriodIcon mealPeriod={value} />
        }));
    }, [t]);

    useEffect(() => {
        if (initialMealPeriod) {
            setMealPeriod(initialMealPeriod);
        }
    }, [initialMealPeriod]);

    const selectedItem = useMemo(
        () => searchResults.find((item) => item.id === selectedItemId) || null,
        [searchResults, selectedItemId]
    );

    const searchRecentFoodsQuery = useRecentFoodsQuery(
        { q: searchRecentQueryText, limit: 6 },
        { enabled: mode === 'food' && searchView === 'results' && searchRecentQueryText.length >= 2 }
    );
    const searchRecentFoods = useMemo(() => searchRecentFoodsQuery.data ?? [], [searchRecentFoodsQuery.data]);
    const searchMyFoodsQuery = useMyFoodsQuery(
        { q: searchRecentQueryText, type: 'FOOD' },
        { enabled: mode === 'food' && searchView === 'results' && searchRecentQueryText.length > 0 }
    );
    const searchMyFoods = useMemo(() => searchMyFoodsQuery.data ?? [], [searchMyFoodsQuery.data]);
    const selectedSearchMyFood = useMemo(() => {
        if (selectedSearchMyFoodId === null) return null;
        return searchMyFoods.find((food) => food.id === selectedSearchMyFoodId) ?? null;
    }, [searchMyFoods, selectedSearchMyFoodId]);
    const selectedRecentFood = useMemo(() => {
        if (!selectedRecentFoodId) return null;
        return searchRecentFoods.find((food) => food.id === selectedRecentFoodId) ?? null;
    }, [searchRecentFoods, selectedRecentFoodId]);
    const searchRecentProviderKeys = useMemo(() => {
        const keys = new Set<string>();
        searchRecentFoods.forEach((food) => {
            const key = getRecentProviderKey(food);
            if (key) keys.add(key);
        });
        return keys;
    }, [searchRecentFoods]);
    const dedupedSearchResults = useMemo(() => {
        if (searchRecentProviderKeys.size === 0) return searchResults;
        return searchResults.filter((item) => {
            const key = getProviderResultKey(item);
            return !key || !searchRecentProviderKeys.has(key);
        });
    }, [searchRecentProviderKeys, searchResults]);

    const myFoodsQuery = useMyFoodsQuery(
        { q: debouncedMyFoodsQueryText, type: 'RECIPE' },
        { enabled: mode === 'recipes' }
    );

    const myFoods = useMemo(() => myFoodsQuery.data ?? [], [myFoodsQuery.data]);

    const selectedMyFood = useMemo(() => {
        if (selectedMyFoodId === null) return null;
        return myFoods.find((food) => food.id === selectedMyFoodId) ?? null;
    }, [myFoods, selectedMyFoodId]);

    const myFoodCaloriesPreview = useMemo(() => {
        if (!selectedMyFood) return null;
        const servings = Number(myFoodServingsConsumed);
        if (!Number.isFinite(servings) || servings <= 0) return null;
        return Math.round(servings * selectedMyFood.calories_per_serving);
    }, [myFoodServingsConsumed, selectedMyFood]);

    const recentFoodCaloriesPreview = useMemo(() => {
        if (!selectedRecentFood) return null;
        const caloriesPerServing = selectedRecentFood.calories_per_serving_snapshot;
        if (typeof caloriesPerServing !== 'number' || !Number.isFinite(caloriesPerServing)) {
            return selectedRecentFood.calories;
        }

        const servings = Number(recentFoodServingsConsumed);
        if (!Number.isFinite(servings) || servings <= 0) return null;
        return Math.round(servings * caloriesPerServing);
    }, [recentFoodServingsConsumed, selectedRecentFood]);

    const searchMyFoodCaloriesPreview = useMemo(() => {
        if (!selectedSearchMyFood) return null;
        const servings = Number(searchMyFoodServingsConsumed);
        if (!Number.isFinite(servings) || servings <= 0) return null;
        return Math.round(servings * selectedSearchMyFood.calories_per_serving);
    }, [searchMyFoodServingsConsumed, selectedSearchMyFood]);

    const shouldShowMealPeriod = mode === 'food' || mode === 'recipes';

    // Avoid stale recipe selections if users leave and return to the Recipes tab.
    useEffect(() => {
        setSelectedMyFoodId(null);
        setMyFoodServingsConsumed('1');
    }, [mode]);

    const selectedMeasure = useMemo(() => {
        if (!selectedItem) return null;
        const byLabel = selectedItem.availableMeasures.find((m) => m.label === selectedMeasureLabel);
        if (byLabel) return byLabel;
        return getPreferredMeasure(selectedItem);
    }, [selectedItem, selectedMeasureLabel]);

    const computed = useMemo(() => {
        if (!selectedItem || !selectedMeasure) {
            return null;
        }
        return getMeasureCalories(selectedItem, selectedMeasure, quantity);
    }, [selectedItem, selectedMeasure, quantity]);

    const computedMeasureLabel = useMemo(() => {
        if (!selectedMeasure) {
            return '';
        }
        return formatMeasureLabelWithQuantity(selectedMeasure.label, quantity);
    }, [selectedMeasure, quantity]);

    /**
     * Clear the current selected search result so new searches require an explicit choice.
     */
    const clearSelectedSearchItem = useCallback(() => {
        setSelectedItemId(null);
        setSelectedMeasureLabel(null);
        setQuantity(1);
    }, []);

    const clearSelectedRecentFood = useCallback(() => {
        setSelectedRecentFoodId(null);
        setRecentFoodServingsConsumed('1');
    }, []);

    const clearSelectedSearchMyFood = useCallback(() => {
        setSelectedSearchMyFoodId(null);
        setSearchMyFoodServingsConsumed('1');
    }, []);

    /**
     * Select a search result and prime measure/quantity controls for quick logging.
     */
    const selectSearchResult = useCallback(
        (item: NormalizedFoodItem) => {
            if (isSubmitting) return;
            setSelectedItemId(item.id);
            setSelectedMeasureLabel(getPreferredMeasureLabel(item));
            setQuantity(1);
            setSearchView('selected');
            clearSelectedRecentFood();
            clearSelectedSearchMyFood();
        },
        [clearSelectedRecentFood, clearSelectedSearchMyFood, isSubmitting]
    );

    const selectRecentFood = useCallback(
        (food: RecentFood) => {
            if (isSubmitting) return;
            setSelectedRecentFoodId(food.id);
            setRecentFoodServingsConsumed(
                typeof food.servings_consumed === 'number' && Number.isFinite(food.servings_consumed)
                    ? String(food.servings_consumed)
                    : '1'
            );
            setMealPeriod(initialMealPeriod ?? food.meal_period);
            clearSelectedSearchItem();
            clearSelectedSearchMyFood();
            setSearchView('selected');
        },
        [clearSelectedSearchItem, clearSelectedSearchMyFood, initialMealPeriod, isSubmitting]
    );

    const selectSearchMyFood = useCallback(
        (food: MyFood) => {
            if (isSubmitting) return;
            setSelectedSearchMyFoodId(food.id);
            setSearchMyFoodServingsConsumed('1');
            clearSelectedSearchItem();
            clearSelectedRecentFood();
            setSearchView('selected');
        },
        [clearSelectedRecentFood, clearSelectedSearchItem, isSubmitting]
    );

    type FoodSearchResponse = {
        provider?: string;
        supportsBarcodeLookup?: boolean;
        items: NormalizedFoodItem[];
    };

    /**
     * Fetch a single page of provider results via the backend search endpoint.
     */
    const fetchFoodSearchPage = useCallback(async (params: FoodSearchParams, page: number): Promise<FoodSearchResponse> => {
        const response = await axios.get('/api/food/search', {
            params: {
                ...(params.query ? { q: params.query } : {}),
                ...(params.barcode ? { barcode: params.barcode } : {}),
                page,
                pageSize: SEARCH_PAGE_SIZE
            }
        });

        return {
            provider: typeof response.data?.provider === 'string' ? response.data.provider : undefined,
            supportsBarcodeLookup:
                typeof response.data?.supportsBarcodeLookup === 'boolean' ? response.data.supportsBarcodeLookup : undefined,
            items: Array.isArray(response.data?.items) ? response.data.items : []
        };
    }, []);

    /**
     * Execute a provider search and reset selection so query searches require an explicit choice.
     */
    const performFoodSearch = useCallback(
        async (request: FoodSearchParams) => {
            if (isSubmitting) return;

            const trimmedQuery = request.query?.trim();
            const barcode = request.barcode?.trim();
            const normalizedBarcode =
                barcode || (trimmedQuery && isBarcodeCandidate(trimmedQuery) ? normalizeBarcodeCandidate(trimmedQuery) : '');
            const resolvedQuery = barcode ? trimmedQuery : normalizedBarcode ? undefined : trimmedQuery;

            if (!resolvedQuery && !normalizedBarcode) {
                return;
            }

            const params: FoodSearchParams = {
                query: resolvedQuery || undefined,
                barcode: normalizedBarcode || undefined
            };

            searchSessionRef.current += 1;
            const sessionId = searchSessionRef.current;
            loadMoreLockRef.current = false;

            setHasSearched(true);
            setIsSearching(true);
            setError(null);
            setSearchResults([]);
            setSearchPage(1);
            setHasMoreResults(false);
            setIsLoadingMoreResults(false);
            setActiveSearch(params);
            setSearchView('results');
            clearSelectedSearchItem();
            clearSelectedRecentFood();
            clearSelectedSearchMyFood();

            try {
                const firstPage = await fetchFoodSearchPage(params, 1);
                if (searchSessionRef.current !== sessionId) {
                    return;
                }

                setProviderName(firstPage.provider || '');
                setSupportsBarcodeLookup(
                    typeof firstPage.supportsBarcodeLookup === 'boolean' ? firstPage.supportsBarcodeLookup : null
                );
                setSearchResults(firstPage.items);
                setHasMoreResults(firstPage.items.length === SEARCH_PAGE_SIZE);
                if (params.barcode && firstPage.items.length === 0) {
                    haptic.warning();
                }

                // Barcode lookups generally return a single exact match; auto-select it for faster logging.
                if (params.barcode && !params.query && firstPage.items.length === 1) {
                    selectSearchResult(firstPage.items[0]);
                }
            } catch (err) {
                if (params.barcode) {
                    haptic.error();
                }
                setError(getApiErrorMessage(err) ?? t('foodEntry.search.error.searchFailed'));
            } finally {
                if (searchSessionRef.current === sessionId) {
                    setIsSearching(false);
                }
            }
        },
        [
            clearSelectedRecentFood,
            clearSelectedSearchItem,
            clearSelectedSearchMyFood,
            fetchFoodSearchPage,
            isSubmitting,
            selectSearchResult,
            t
        ]
    );

    // Trigger provider searches automatically while typing, and keep the Search tab stable when the input is cleared.
    useEffect(() => {
        if (mode !== 'food') {
            return;
        }

        const query = debouncedSearchQuery.trim();
        if (!query) {
            // Cancel any in-flight search session and return to the "no results yet" state.
            searchSessionRef.current += 1;
            loadMoreLockRef.current = false;
            setError(null);
            setHasSearched(false);
            setSearchResults([]);
            setSelectedItemId(null);
            setSelectedMeasureLabel(null);
            setQuantity(1);
            clearSelectedRecentFood();
            clearSelectedSearchMyFood();
            setSearchView('results');
            setSearchPage(1);
            setHasMoreResults(false);
            setIsSearching(false);
            setIsLoadingMoreResults(false);
            setProviderName('');
            setSupportsBarcodeLookup(null);
            setActiveSearch(null);
            return;
        }

        // If the current active search already matches the debounced query, don't re-run it.
        if (activeSearch?.query === query && !activeSearch.barcode) {
            return;
        }

        // Avoid re-running barcode lookups as "query" searches when a scanner just populated the field.
        if (activeSearch?.barcode && !activeSearch.query && activeSearch.barcode === query) {
            return;
        }

        void performFoodSearch({ query });
    }, [activeSearch, clearSelectedRecentFood, clearSelectedSearchMyFood, debouncedSearchQuery, mode, performFoodSearch]);

    /**
     * Load the next page of search results and append them to the list view.
     */
    const loadMoreSearchResults = useCallback(async () => {
        if (isSubmitting || !activeSearch || !hasMoreResults || isSearching || isLoadingMoreResults) {
            return;
        }
        if (loadMoreLockRef.current) {
            return;
        }

        loadMoreLockRef.current = true;
        setIsLoadingMoreResults(true);

        const sessionId = searchSessionRef.current;
        const nextPageNumber = searchPage + 1;

        try {
            const nextPage = await fetchFoodSearchPage(activeSearch, nextPageNumber);
            if (searchSessionRef.current !== sessionId) {
                return;
            }

            setSearchResults((current) => mergeUniqueResults(current, nextPage.items));
            setSearchPage(nextPageNumber);
            setHasMoreResults(nextPage.items.length === SEARCH_PAGE_SIZE);
        } catch (err) {
            setError(getApiErrorMessage(err) ?? t('foodEntry.search.error.loadMoreFailed'));
        } finally {
            if (searchSessionRef.current === sessionId) {
                setIsLoadingMoreResults(false);
                loadMoreLockRef.current = false;
            }
        }
    }, [activeSearch, fetchFoodSearchPage, hasMoreResults, isLoadingMoreResults, isSearching, isSubmitting, searchPage, t]);

    const handleAddQuickEntry = async (opts: { closeDialog: boolean }) => {
        const trimmedName = quickEntryName.trim();
        if (!trimmedName || !quickEntryCalories.trim()) {
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/food', {
                name: trimmedName,
                calories: quickEntryCalories,
                meal_period: mealPeriod,
                ...(entryLocalDate ? { date: entryLocalDate } : {})
            });
            haptic.success();
            setSearchQuery('');
            setQuickEntryCalories('');
            setSearchResults([]);
            setHasSearched(false);
            setActiveSearch(null);
            setProviderName('');
            setSupportsBarcodeLookup(null);
            setSearchView('results');
            clearSelectedSearchItem();
            clearSelectedRecentFood();
            clearSelectedSearchMyFood();
            onSuccess?.({ closeDialog: opts.closeDialog });
        } catch (err) {
            haptic.error();
            setError(getApiErrorMessage(err) ?? t('foodEntry.error.unableToAdd'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddFromMyFoods = async (opts: { closeDialog: boolean }) => {
        if (!selectedMyFood) return;
        const servings = Number(myFoodServingsConsumed);
        if (!Number.isFinite(servings) || servings <= 0) return;

        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/food', {
                my_food_id: selectedMyFood.id,
                servings_consumed: servings,
                meal_period: mealPeriod,
                ...(entryLocalDate ? { date: entryLocalDate } : {})
            });

            // Keep selection around for multi-add workflows, but reset servings to a sensible default.
            haptic.success();
            setMyFoodServingsConsumed('1');
            onSuccess?.({ closeDialog: opts.closeDialog });
        } catch (err) {
            haptic.error();
            setError(getApiErrorMessage(err) ?? t('foodEntry.error.unableToAdd'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const buildExternalSnapshotPayload = () => {
        if (!selectedItem || !selectedMeasure || !computed) return null;

        const servingUnitLabel =
            selectedMeasure.unit?.trim() || formatMeasureLabelForDisplay(selectedMeasure.label).trim() || selectedMeasure.label;
        const caloriesPerServing = quantity > 0 ? computed.calories / quantity : computed.calories;

        return {
            name: selectedItem.description,
            calories: computed.calories,
            servings_consumed: quantity,
            serving_size_quantity_snapshot: selectedMeasure.quantity ?? 1,
            serving_unit_label_snapshot: servingUnitLabel,
            calories_per_serving_snapshot: caloriesPerServing,
            external_source: selectedItem.source,
            external_id: selectedItem.id,
            brand: selectedItem.brand,
            locale: selectedItem.locale,
            barcode: selectedItem.barcode,
            measure_label: selectedMeasure.label,
            grams_per_measure_snapshot: selectedMeasure.gramWeight,
            measure_quantity_snapshot: quantity,
            grams_total_snapshot: computed.grams
        };
    };

    const buildRecentFoodPayload = (food: RecentFood) => {
        const caloriesPerServing = food.calories_per_serving_snapshot;
        const parsedServings =
            typeof caloriesPerServing === 'number' && Number.isFinite(caloriesPerServing)
                ? Number(recentFoodServingsConsumed)
                : (food.servings_consumed ?? null);
        const hasPositiveServings =
            typeof parsedServings === 'number' && Number.isFinite(parsedServings) && parsedServings > 0;
        const calories =
            typeof caloriesPerServing === 'number' && Number.isFinite(caloriesPerServing) && hasPositiveServings
                ? Math.round(parsedServings * caloriesPerServing)
                : food.calories;

        if (typeof food.my_food_id === 'number' && Number.isFinite(food.my_food_id) && hasPositiveServings) {
            return {
                my_food_id: food.my_food_id,
                servings_consumed: parsedServings
            };
        }

        return {
            name: food.name,
            calories,
            ...(hasPositiveServings ? { servings_consumed: parsedServings } : {}),
            serving_size_quantity_snapshot: food.serving_size_quantity_snapshot,
            serving_unit_label_snapshot: food.serving_unit_label_snapshot,
            calories_per_serving_snapshot: food.calories_per_serving_snapshot,
            external_source: food.external_source,
            external_id: food.external_id,
            brand: food.brand_snapshot,
            locale: food.locale_snapshot,
            barcode: food.barcode_snapshot,
            measure_label: food.measure_label_snapshot,
            grams_per_measure_snapshot: food.grams_per_measure_snapshot,
            measure_quantity_snapshot: hasPositiveServings ? parsedServings : food.measure_quantity_snapshot,
            grams_total_snapshot:
                typeof food.grams_per_measure_snapshot === 'number' && hasPositiveServings
                    ? food.grams_per_measure_snapshot * parsedServings
                    : food.grams_total_snapshot
        };
    };

    const handleAddFromSearch = async (opts: { closeDialog: boolean }) => {
        if (selectedSearchMyFood) {
            const servings = Number(searchMyFoodServingsConsumed);
            if (!Number.isFinite(servings) || servings <= 0) return;

            setIsSubmitting(true);
            setError(null);
            try {
                await axios.post('/api/food', {
                    my_food_id: selectedSearchMyFood.id,
                    servings_consumed: servings,
                    meal_period: mealPeriod,
                    ...(entryLocalDate ? { date: entryLocalDate } : {})
                });

                haptic.success();
                setSearchMyFoodServingsConsumed('1');
                onSuccess?.({ closeDialog: opts.closeDialog });
            } catch (err) {
                haptic.error();
                setError(getApiErrorMessage(err) ?? t('foodEntry.error.unableToAdd'));
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (selectedRecentFood) {
            const recentPayload = buildRecentFoodPayload(selectedRecentFood);
            setIsSubmitting(true);
            setError(null);
            try {
                await axios.post('/api/food', {
                    ...recentPayload,
                    meal_period: mealPeriod,
                    ...(entryLocalDate ? { date: entryLocalDate } : {})
                });
                haptic.success();
                setRecentFoodServingsConsumed('1');
                onSuccess?.({ closeDialog: opts.closeDialog });
            } catch (err) {
                haptic.error();
                setError(getApiErrorMessage(err) ?? t('foodEntry.error.unableToAdd'));
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!selectedItem || !computed) return;
        const externalPayload = buildExternalSnapshotPayload();
        if (!externalPayload) return;

        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/food', {
                ...externalPayload,
                meal_period: mealPeriod,
                ...(entryLocalDate ? { date: entryLocalDate } : {})
            });
            haptic.success();
            onSuccess?.({ closeDialog: opts.closeDialog });
        } catch (err) {
            haptic.error();
            setError(getApiErrorMessage(err) ?? t('foodEntry.error.unableToAdd'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const providerLookupNote = supportsBarcodeLookup === false ? ` ${t('foodEntry.search.barcodeUnavailable')}` : '';
    const canUseBarcodeScanner = supportsBarcodeLookup !== false;
    // FatSecret terms require attribution wherever FatSecret content is displayed.
    const showFatSecretAttribution = providerName.trim().toLowerCase() === 'fatsecret';

    const isSearchRecentLoading = searchRecentFoodsQuery.isLoading && searchRecentFoods.length === 0;
    const isSearchMyFoodsLoading = searchMyFoodsQuery.isLoading && searchMyFoods.length === 0;
    const isUnifiedSearchPending = isSearching || isSearchRecentLoading || isSearchMyFoodsLoading;
    const searchRecentRows = searchRecentFoods.map((food) => (
        <ListItemButton
            key={`recent-${food.id}`}
            selected={food.id === selectedRecentFoodId}
            onClick={() => selectRecentFood(food)}
            disabled={isSubmitting}
            sx={{ alignItems: 'flex-start' }}
        >
            <ListItemIcon sx={{ minWidth: 32, alignSelf: 'center' }}>
                <HistoryIcon fontSize="small" color="action" />
            </ListItemIcon>
            <ListItemText
                primary={food.name}
                secondary={buildRecentFoodSecondaryText(food)}
                slotProps={{
                    primary: { variant: 'body2' },
                    secondary: { variant: 'caption', sx: { color: 'text.secondary' } }
                }}
            />
        </ListItemButton>
    ));
    const searchMyFoodRows =
        searchMyFoods.length > 0
            ? [
                  <ListSubheader key="my-foods-heading" component="div" disableSticky>
                      {t('foodEntry.mode.myFoods')}
                  </ListSubheader>,
                  ...searchMyFoods.map((food) => (
                      <ListItemButton
                          key={`my-food-${food.id}`}
                          selected={food.id === selectedSearchMyFoodId}
                          onClick={() => selectSearchMyFood(food)}
                          disabled={isSubmitting}
                          sx={{ alignItems: 'flex-start' }}
                      >
                          <ListItemText
                              primary={food.name}
                              secondary={`${Math.round(food.calories_per_serving)} kcal per ${food.serving_size_quantity} ${food.serving_unit_label}`}
                              slotProps={{
                                  primary: { variant: 'body2' },
                                  secondary: { variant: 'caption', sx: { color: 'text.secondary' } }
                              }}
                          />
                      </ListItemButton>
                  ))
              ]
            : [];
    const leadingSearchRows = [...searchRecentRows, ...searchMyFoodRows];

    // Compute the search panel body outside JSX so the layout stays readable.
    let searchResultsContent: React.ReactNode;

    if (searchView === 'selected' && selectedSearchMyFood) {
        const servingDescriptor = `${selectedSearchMyFood.serving_size_quantity} ${selectedSearchMyFood.serving_unit_label}`;

        searchResultsContent = (
            <Stack spacing={2}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 2,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1.5
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{t('foodEntry.search.selected.title')}</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {selectedSearchMyFood.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {`${Math.round(selectedSearchMyFood.calories_per_serving)} kcal per ${servingDescriptor}`}
                        </Typography>
                    </Box>
                    <Button
                        variant="text"
                        type="button"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => {
                            clearSelectedSearchMyFood();
                            setSearchView('results');
                        }}
                    >
                        {t('foodEntry.search.selected.back')}
                    </Button>
                </Box>

                <TextField
                    label={t('foodEntry.myFoods.servingsConsumed', { serving: servingDescriptor })}
                    type="number"
                    value={searchMyFoodServingsConsumed}
                    onChange={(e) => setSearchMyFoodServingsConsumed(e.target.value)}
                    disabled={isSubmitting}
                    slotProps={{
                        htmlInput: { min: 0, step: 0.1 }
                    }}
                />
                {searchMyFoodCaloriesPreview !== null && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('foodEntry.myFoods.caloriesPreview', { calories: searchMyFoodCaloriesPreview })}
                    </Typography>
                )}
            </Stack>
        );
    } else if (searchView === 'selected' && selectedRecentFood) {
        const servingUnit = selectedRecentFood.serving_unit_label_snapshot ?? t('foodEntry.recent.servingFallback');
        const canEditRecentServings =
            typeof selectedRecentFood.calories_per_serving_snapshot === 'number' &&
            Number.isFinite(selectedRecentFood.calories_per_serving_snapshot);

        searchResultsContent = (
            <Stack spacing={2}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 2,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1.5
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{t('foodEntry.recent.selected')}</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {selectedRecentFood.name}
                            {selectedRecentFood.brand_snapshot ? ` (${selectedRecentFood.brand_snapshot})` : ''}
                        </Typography>
                    </Box>
                    <Button
                        variant="text"
                        type="button"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => {
                            clearSelectedRecentFood();
                            setSearchView('results');
                        }}
                    >
                        {t('foodEntry.search.selected.back')}
                    </Button>
                </Box>

                {canEditRecentServings && (
                    <TextField
                        label={t('foodEntry.myFoods.servingsConsumed', { serving: servingUnit })}
                        type="number"
                        value={recentFoodServingsConsumed}
                        onChange={(e) => setRecentFoodServingsConsumed(e.target.value)}
                        disabled={isSubmitting}
                        slotProps={{
                            htmlInput: { min: 0, step: 0.1 }
                        }}
                    />
                )}
                {recentFoodCaloriesPreview !== null && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('foodEntry.myFoods.caloriesPreview', { calories: recentFoodCaloriesPreview })}
                    </Typography>
                )}
            </Stack>
        );
    } else if (searchView === 'selected' && selectedItem) {
        searchResultsContent = (
            <Stack spacing={2}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 2,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1.5
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{t('foodEntry.search.selected.title')}</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {selectedItem.description}
                            {selectedItem.brand ? ` (${selectedItem.brand})` : ''}
                        </Typography>
                    </Box>
                    <Button
                        variant="text"
                        type="button"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => setSearchView('results')}
                    >
                        {t('foodEntry.search.selected.back')}
                    </Button>
                </Box>

                <FormControl fullWidth>
                    <InputLabel>{t('foodEntry.search.measure')}</InputLabel>
                    <Select
                        value={selectedMeasure?.label || ''}
                        label={t('foodEntry.search.measure')}
                        onChange={(e) => setSelectedMeasureLabel(e.target.value)}
                        disabled={isSubmitting}
                    >
                        {(selectedItem.availableMeasures || [])
                            .filter((m) => m.gramWeight)
                            .map((measure) => (
                                <MenuItem key={measure.label} value={measure.label}>
                                    {measure.label} {measure.gramWeight ? `(${measure.gramWeight} g)` : ''}
                                </MenuItem>
                            ))}
                    </Select>
                </FormControl>

                <TextField
                    label={t('foodEntry.search.quantity')}
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    disabled={!selectedMeasure || isSubmitting}
                    slotProps={{
                        htmlInput: { min: 0, step: 0.5 }
                    }}
                />

                <Box>
                    <Typography variant="body2" sx={{
                        color: "text.secondary"
                    }}>
                        {selectedItem.nutrientsPer100g
                            ? t('foodEntry.search.caloriesEstimated')
                            : t('foodEntry.search.caloriesUnavailable')}
                    </Typography>
                    {computed && (
                        <Typography variant="subtitle1" sx={{ mt: 1 }}>
                            {t('foodEntry.search.computedSummary', {
                                calories: computed.calories,
                                measureLabel: computedMeasureLabel
                            })}
                        </Typography>
                    )}
                </Box>
            </Stack>
        );
    } else if (searchView === 'results') {
        const hasUnifiedSearchRows = leadingSearchRows.length > 0 || dedupedSearchResults.length > 0;

        if (!hasUnifiedSearchRows && isUnifiedSearchPending) {
            searchResultsContent = <LinearProgress aria-label={t('foodEntry.search.empty.searching')} />;
        } else if (!hasUnifiedSearchRows) {
            let emptyMessage = t('foodEntry.search.empty.start');
            if (hasSearched) {
                emptyMessage = t('foodEntry.search.empty.noMatches');
            }

            searchResultsContent = (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {emptyMessage}
                </Typography>
            );
        } else {
            searchResultsContent = (
                <Stack spacing={1}>
                    <Typography variant="subtitle2">{t('foodEntry.search.results.title')}</Typography>
                    <FoodSearchResultsList
                        items={dedupedSearchResults}
                        selectedItemId={selectedItemId}
                        hasMore={hasMoreResults}
                        isLoading={isUnifiedSearchPending}
                        isLoadingMore={isLoadingMoreResults}
                        leadingItems={leadingSearchRows}
                        onLoadMore={() => void loadMoreSearchResults()}
                        onSelect={selectSearchResult}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t('foodEntry.search.results.tapHint')}
                    </Typography>
                </Stack>
            );
        }
    } else {
        searchResultsContent = (
            <Typography variant="body2" sx={{
                color: "text.secondary"
            }}>
                {t('foodEntry.search.selectToContinue')}
            </Typography>
        );
    }

    const canAddSelectedSearch =
        (Boolean(selectedItem) && Boolean(computed) && searchView === 'selected') ||
        (Boolean(selectedRecentFood) && recentFoodCaloriesPreview !== null) ||
        (Boolean(selectedSearchMyFood) && searchMyFoodCaloriesPreview !== null);
    const canAddSelectedMyFood = Boolean(selectedMyFood) && myFoodCaloriesPreview !== null;
    const canAddQuickEntry = Boolean(quickEntryName.trim()) && Boolean(quickEntryCalories.trim());
    const canAddFoodEntry = canAddSelectedSearch || canAddQuickEntry;
    const handleAddFoodEntry = (opts: { closeDialog: boolean }) => {
        if (canAddSelectedSearch) {
            return handleAddFromSearch(opts);
        }
        return handleAddQuickEntry(opts);
    };

    return (
        <>
            <DialogContent sx={{ flex: 1, overflowY: 'auto' }}>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <ToggleButtonGroup
                        value={mode}
                        exclusive
                        onChange={(_, next) => next && setMode(next)}
                        size="small"
                        color="primary"
                        disabled={isSubmitting}
                        sx={{
                            width: '100%',
                            flexWrap: 'wrap',
                            '& .MuiToggleButton-root': { flex: { xs: '1 1 45%', sm: 1 } }
                        }}
                    >
                        <ToggleButton value="food">{t('foodEntry.mode.food')}</ToggleButton>
                        <ToggleButton value="recipes">{t('foodEntry.mode.myRecipes')}</ToggleButton>
                    </ToggleButtonGroup>

                    {error && <Alert severity="error">{error}</Alert>}

                    {mode === 'food' ? (
                        <Stack spacing={2}>
                            <TextField
                                label={t('foodEntry.search.label')}
                                placeholder={t('foodEntry.search.placeholder')}
                                fullWidth
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                disabled={isSubmitting}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void performFoodSearch({ query: searchQuery });
                                    }
                                }}
                                slotProps={{
                                    input: {
                                        endAdornment: canUseBarcodeScanner ? (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    aria-label={t('foodEntry.search.scanBarcode')}
                                                    title={t('foodEntry.search.scanBarcode')}
                                                    onClick={() => setIsScannerOpen(true)}
                                                    size="small"
                                                    edge="end"
                                                    disabled={isSearching || isSubmitting}
                                                >
                                                    <QrCodeScannerIcon />
                                                </IconButton>
                                            </InputAdornment>
                                        ) : undefined
                                    }
                                }}
                            />
                            {searchView === 'results' && quickEntryName && (
                                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                                    <Stack
                                        direction={{ xs: 'column', sm: 'row' }}
                                        spacing={1}
                                        sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
                                    >
                                        <Typography
                                            variant="subtitle2"
                                            sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}
                                        >
                                            {t('foodEntry.quickEntry.inlineTitle', { name: quickEntryName })}
                                        </Typography>
                                        <TextField
                                            label={t('foodEntry.quickEntry.calories')}
                                            type="number"
                                            value={quickEntryCalories}
                                            onChange={(e) => setQuickEntryCalories(e.target.value)}
                                            disabled={isSubmitting}
                                            sx={{ minWidth: { sm: 160 } }}
                                            slotProps={{
                                                htmlInput: { min: 0, step: 1 }
                                            }}
                                        />
                                    </Stack>
                                </Box>
                            )}
                            {providerName && (
                                <Typography variant="caption" sx={{
                                    color: "text.secondary"
                                }}>
                                    {t('foodEntry.search.providerLabel', { provider: providerName })}
                                    {providerLookupNote}
                                </Typography>
                            )}
                            {showFatSecretAttribution && (
                                <Box
                                    sx={(theme) => ({
                                        mt: 0.5,
                                        fontSize: theme.typography.caption.fontSize
                                    })}
                                >
                                    <FatSecretAttributionLink />
                                </Box>
                            )}

                            <BarcodeScannerDialog
                                open={isScannerOpen}
                                onClose={() => setIsScannerOpen(false)}
                                onDetected={(barcode) => {
                                    setSearchQuery(barcode);
                                    void performFoodSearch({ barcode });
                                }}
                            />

                            {searchResultsContent}
                        </Stack>
                    ) : (
                        <Stack spacing={2}>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                sx={{
                                    alignItems: { xs: 'stretch', sm: 'center' }
                                }}
                            >
                                <Button
                                    variant="outlined"
                                    type="button"
                                    onClick={() => setIsNewRecipeDialogOpen(true)}
                                    disabled={isSubmitting}
                                >
                                    {t('foodEntry.myRecipes.newRecipe')}
                                </Button>
                            </Stack>

                            <TextField
                                label={t('foodEntry.myRecipes.searchLabel')}
                                placeholder={t('foodEntry.myRecipes.searchPlaceholder')}
                                fullWidth
                                value={myFoodsQueryText}
                                onChange={(e) => setMyFoodsQueryText(e.target.value)}
                                disabled={isSubmitting}
                            />

                            {myFoodsQuery.isLoading ? (
                                <Stack direction="row" spacing={1} sx={{
                                    alignItems: "center"
                                }}>
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
                                        {t('common.loading')}
                                    </Typography>
                                </Stack>
                            ) : myFoodsQuery.isError ? (
                                <Typography variant="body2" sx={{
                                    color: "text.secondary"
                                }}>
                                    {t('foodEntry.myRecipes.error.unableToLoad')}
                                </Typography>
                            ) : myFoods.length === 0 ? (
                                <Typography variant="body2" sx={{
                                    color: "text.secondary"
                                }}>
                                    {t('foodEntry.myRecipes.empty', { newRecipe: t('foodEntry.myRecipes.newRecipe') })}
                                </Typography>
                            ) : (
                                <Box
                                    sx={{
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        overflow: 'hidden',
                                        maxHeight: MY_FOODS_LIST_HEIGHT,
                                        overflowY: 'auto'
                                    }}
                                >
                                    <List dense disablePadding>
                                        {myFoods.map((recipe) => {
                                            const secondary = `${Math.round(recipe.calories_per_serving)} kcal per ${recipe.serving_size_quantity} ${recipe.serving_unit_label}`;
                                            return (
                                                <ListItemButton
                                                    key={recipe.id}
                                                    selected={recipe.id === selectedMyFoodId}
                                                    onClick={() => setSelectedMyFoodId(recipe.id)}
                                                    disabled={isSubmitting}
                                                >
                                                    <ListItemText
                                                        primary={recipe.name}
                                                        secondary={secondary}
                                                        slotProps={{
                                                            primary: { variant: 'body2' },
                                                            secondary: { variant: 'caption', color: 'text.secondary' }
                                                        }} />
                                                </ListItemButton>
                                            );
                                        })}
                                    </List>
                                </Box>
                            )}

                            {selectedMyFood && (
                                <Stack spacing={1.5}>
                                    {(() => {
                                        const servingDescriptor = `${selectedMyFood.serving_size_quantity} ${selectedMyFood.serving_unit_label}`;
                                        return (
                                            <TextField
                                                label={t('foodEntry.myFoods.servingsConsumed', { serving: servingDescriptor })}
                                                type="number"
                                                value={myFoodServingsConsumed}
                                                onChange={(e) => setMyFoodServingsConsumed(e.target.value)}
                                                disabled={isSubmitting}
                                                slotProps={{
                                                    htmlInput: { min: 0, step: 0.1 }
                                                }}
                                            />
                                        );
                                    })()}
                                    {myFoodCaloriesPreview !== null && (
                                        <Typography variant="body2" sx={{
                                            color: "text.secondary"
                                        }}>
                                            {t('foodEntry.myFoods.caloriesPreview', { calories: myFoodCaloriesPreview })}
                                        </Typography>
                                    )}
                                </Stack>
                            )}

                            <NewRecipeDialog
                                open={isNewRecipeDialogOpen}
                                date={entryLocalDate}
                                mealPeriod={mealPeriod}
                                onClose={() => setIsNewRecipeDialogOpen(false)}
                                onSaved={(created) => {
                                    void queryClient.invalidateQueries({ queryKey: ['my-foods'] });
                                    setSelectedMyFoodId(created.id);
                                }}
                                onLogged={() => {
                                    void queryClient.invalidateQueries({ queryKey: ['food'] });
                                    void queryClient.invalidateQueries({ queryKey: ['recent-foods'] });
                                    void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
                                    onSuccess?.({ closeDialog: true });
                                }}
                            />
                        </Stack>
                    )}

                    {shouldShowMealPeriod && (
                        <FormControl fullWidth>
                            <InputLabel>{t('foodEntry.mealPeriod.label')}</InputLabel>
                            <Select
                                value={mealPeriod}
                                label={t('foodEntry.mealPeriod.label')}
                                onChange={(e) => setMealPeriod(e.target.value as MealPeriod)}
                                disabled={isSubmitting}
                            >
                                {mealOptions.map((meal) => (
                                    <MenuItem key={meal.value} value={meal.value}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>{meal.icon}</ListItemIcon>
                                        {meal.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {mode === 'food' ? (
                    <>
                        <Button
                            variant="outlined"
                            type="button"
                            onClick={() => void handleAddFoodEntry({ closeDialog: false })}
                            disabled={isSubmitting || !canAddFoodEntry}
                        >
                            {isSubmitting ? t('common.adding') : t('foodEntry.actions.addAnother')}
                        </Button>
                        <Button
                            variant="contained"
                            type="button"
                            onClick={() => void handleAddFoodEntry({ closeDialog: true })}
                            disabled={isSubmitting || !canAddFoodEntry}
                        >
                            {isSubmitting ? t('common.adding') : t('foodEntry.actions.addAndClose')}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="outlined"
                            type="button"
                            onClick={() => void handleAddFromMyFoods({ closeDialog: false })}
                            disabled={isSubmitting || !canAddSelectedMyFood}
                        >
                            {isSubmitting ? t('common.adding') : t('foodEntry.actions.addAnother')}
                        </Button>
                        <Button
                            variant="contained"
                            type="button"
                            onClick={() => void handleAddFromMyFoods({ closeDialog: true })}
                            disabled={isSubmitting || !canAddSelectedMyFood}
                        >
                            {isSubmitting ? t('common.adding') : t('foodEntry.actions.addAndClose')}
                        </Button>
                    </>
                )}
            </DialogActions>
        </>
    );
};

export default FoodEntryForm;
