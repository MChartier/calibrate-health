import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    DialogActions,
    DialogContent,
    Divider,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    List,
    ListItemIcon,
    ListItemButton,
    ListItemText,
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
import BarcodeScannerDialog from './BarcodeScannerDialog';
import FoodSearchResultsList from './FoodSearchResultsList';
import MealPeriodIcon from './MealPeriodIcon';
import NewMyFoodDialog from './NewMyFoodDialog';
import NewRecipeDialog from './NewRecipeDialog';
import type { NormalizedFoodItem } from '../types/food';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { useMyFoodsQuery } from '../queries/myFoods';
import { getApiErrorMessage } from '../utils/apiError';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

const SEARCH_PAGE_SIZE = 10;
const MY_FOODS_LIST_HEIGHT = { xs: 220, sm: 260 } as const; // Keeps the list usable inside the dialog without pushing actions off-screen.

type FoodSearchView = 'results' | 'selected';

type FoodSearchParams = {
    query?: string;
    barcode?: string;
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
 * Pick a reasonable default measure label for an item so the measure dropdown is pre-populated after selection.
 */
const getDefaultMeasureLabel = (item: NormalizedFoodItem): string | null => {
    const firstWithWeight = item.availableMeasures.find((measure) => measure.gramWeight);
    return firstWithWeight?.label ?? null;
};

/**
 * Merge paginated results without duplicating items when upstream providers repeat IDs across pages.
 */
const mergeUniqueResults = (current: NormalizedFoodItem[], nextPage: NormalizedFoodItem[]): NormalizedFoodItem[] => {
    const nextById = new Map(current.map((item) => [item.id, item]));
    nextPage.forEach((item) => nextById.set(item.id, item));
    return Array.from(nextById.values());
};

const FoodEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const queryClient = useQueryClient();

    const [mode, setMode] = useState<'myFoods' | 'myRecipes' | 'search'>('search');

    const [quickEntryName, setQuickEntryName] = useState('');
    const [quickEntryCalories, setQuickEntryCalories] = useState('');
    const [mealPeriod, setMealPeriod] = useState<MealPeriod>(() => getDefaultMealPeriodForTime(new Date()));

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

    const [isNewFoodDialogOpen, setIsNewFoodDialogOpen] = useState(false);
    const [isNewRecipeDialogOpen, setIsNewRecipeDialogOpen] = useState(false);

    const [myFoodsQueryText, setMyFoodsQueryText] = useState('');
    const [selectedMyFoodId, setSelectedMyFoodId] = useState<number | null>(null);
    const [myFoodServingsConsumed, setMyFoodServingsConsumed] = useState<string>('1');

    const searchSessionRef = useRef(0);
    const loadMoreLockRef = useRef(false);

    const entryLocalDate = typeof date === 'string' && date.trim().length > 0 ? date.trim() : undefined;

    const debouncedSearchQuery = useDebouncedValue(searchQuery, 350);
    const debouncedMyFoodsQueryText = useDebouncedValue(myFoodsQueryText, 250);

    const mealOptions = MEAL_PERIOD_ORDER.map((value) => ({
        value,
        label: MEAL_PERIOD_LABELS[value],
        icon: <MealPeriodIcon mealPeriod={value} />
    }));

    const selectedItem = useMemo(
        () => searchResults.find((item) => item.id === selectedItemId) || null,
        [searchResults, selectedItemId]
    );

    const myFoodsTypeForMode = mode === 'myFoods' ? 'FOOD' : mode === 'myRecipes' ? 'RECIPE' : 'ALL';
    const myFoodsQuery = useMyFoodsQuery(
        { q: debouncedMyFoodsQueryText, type: myFoodsTypeForMode },
        { enabled: mode !== 'search' }
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

    const shouldShowMealPeriod = mode !== 'search' || (mode === 'search' && searchView === 'selected' && !!selectedItem);

    // Avoid stale selections if users switch between "My Foods" and "My Recipes".
    useEffect(() => {
        setSelectedMyFoodId(null);
        setMyFoodServingsConsumed('1');
    }, [mode]);

    const selectedMeasure = useMemo(() => {
        if (!selectedItem) return null;
        const byLabel = selectedItem.availableMeasures.find((m) => m.label === selectedMeasureLabel);
        if (byLabel) return byLabel;
        const firstWithWeight = selectedItem.availableMeasures.find((m) => m.gramWeight);
        return firstWithWeight ?? null;
    }, [selectedItem, selectedMeasureLabel]);

    const computed = useMemo(() => {
        if (!selectedItem || !selectedMeasure?.gramWeight || !selectedItem.nutrientsPer100g) {
            return null;
        }
        const grams = selectedMeasure.gramWeight * (quantity || 0);
        const caloriesTotal = (selectedItem.nutrientsPer100g.calories * grams) / 100;
        return {
            grams,
            calories: Math.round(caloriesTotal * 10) / 10
        };
    }, [selectedItem, selectedMeasure, quantity]);

    /**
     * Clear the current selected search result so new searches require an explicit choice.
     */
    const clearSelectedSearchItem = useCallback(() => {
        setSelectedItemId(null);
        setSelectedMeasureLabel(null);
        setQuantity(1);
    }, []);

    /**
     * Select a search result and prime measure/quantity controls for quick logging.
     */
    const selectSearchResult = useCallback(
        (item: NormalizedFoodItem) => {
            if (isSubmitting) return;
            setSelectedItemId(item.id);
            setSelectedMeasureLabel(getDefaultMeasureLabel(item));
            setQuantity(1);
            setSearchView('selected');
        },
        [isSubmitting]
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
            if (!trimmedQuery && !barcode) {
                return;
            }

            const params: FoodSearchParams = {
                query: trimmedQuery || undefined,
                barcode: barcode || undefined
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

                // Barcode lookups generally return a single exact match; auto-select it for faster logging.
                if (params.barcode && !params.query && firstPage.items.length === 1) {
                    selectSearchResult(firstPage.items[0]);
                }
            } catch (err) {
                setError(getApiErrorMessage(err) ?? 'Search failed. Please try again.');
            } finally {
                if (searchSessionRef.current === sessionId) {
                    setIsSearching(false);
                }
            }
        },
        [clearSelectedSearchItem, fetchFoodSearchPage, isSubmitting, selectSearchResult]
    );

    // Trigger provider searches automatically while typing, and keep the Search tab stable when the input is cleared.
    useEffect(() => {
        if (mode !== 'search') {
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
    }, [activeSearch, debouncedSearchQuery, mode, performFoodSearch]);

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
            setError(getApiErrorMessage(err) ?? 'Unable to load more results right now.');
        } finally {
            if (searchSessionRef.current === sessionId) {
                setIsLoadingMoreResults(false);
                loadMoreLockRef.current = false;
            }
        }
    }, [activeSearch, fetchFoodSearchPage, hasMoreResults, isLoadingMoreResults, isSearching, isSubmitting, searchPage]);

    const handleAddQuickEntry = async () => {
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
            setQuickEntryName('');
            setQuickEntryCalories('');
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to add this food right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddFromMyFoods = async () => {
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
            setMyFoodServingsConsumed('1');
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to add this food right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddFromSearch = async () => {
        if (!selectedItem || !computed) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/food', {
                name: selectedItem.description,
                calories: computed.calories,
                meal_period: mealPeriod,
                ...(entryLocalDate ? { date: entryLocalDate } : {})
            });
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to add this food right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const providerLookupNote = supportsBarcodeLookup === false ? ' (barcode lookup unavailable)' : '';

    // Compute the search panel body outside JSX so the layout stays readable.
    let searchResultsContent: React.ReactNode;

    if (searchResults.length === 0) {
        let emptyMessage = 'Start typing to search by name, or scan a barcode to see matching items.';
        if (isSearching) {
            emptyMessage = 'Searching...';
        } else if (hasSearched) {
            emptyMessage = 'No matches found. Try a different search term or scan again.';
        }

        searchResultsContent = (
            <Typography variant="body2" color="text.secondary">
                {emptyMessage}
            </Typography>
        );
    } else if (searchView === 'results') {
        searchResultsContent = (
            <Stack spacing={1}>
                <Typography variant="subtitle2">Results</Typography>
                <FoodSearchResultsList
                    items={searchResults}
                    selectedItemId={selectedItemId}
                    hasMore={hasMoreResults}
                    isLoading={isSearching}
                    isLoadingMore={isLoadingMoreResults}
                    onLoadMore={() => void loadMoreSearchResults()}
                    onSelect={selectSearchResult}
                />
                <Typography variant="caption" color="text.secondary">
                    Tap a result to select it.
                </Typography>
            </Stack>
        );
    } else if (selectedItem) {
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
                        <Typography variant="subtitle2">Selected</Typography>
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
                        Back to results
                    </Button>
                </Box>

                <FormControl fullWidth>
                    <InputLabel>Measure</InputLabel>
                    <Select
                        value={selectedMeasure?.label || ''}
                        label="Measure"
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
                    label="Quantity"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    disabled={!selectedMeasure || isSubmitting}
                    inputProps={{ min: 0, step: 0.5 }}
                />

                <Box>
                    <Typography variant="body2" color="text.secondary">
                        {selectedItem.nutrientsPer100g
                            ? 'Calories are estimated from nutrients per 100g.'
                            : 'Calories unavailable for this item.'}
                    </Typography>
                    {computed && (
                        <Typography variant="subtitle1" sx={{ mt: 1 }}>
                            {computed.calories} Calories for {computed.grams} g
                        </Typography>
                    )}
                </Box>
            </Stack>
        );
    } else {
        searchResultsContent = (
            <Typography variant="body2" color="text.secondary">
                Select a result to continue.
            </Typography>
        );
    }

    const canAddSelectedSearch = Boolean(selectedItem) && Boolean(computed) && searchView === 'selected';
    const canAddSelectedMyFood = Boolean(selectedMyFood) && myFoodCaloriesPreview !== null;
    const canAddQuickEntry = Boolean(quickEntryName.trim()) && Boolean(quickEntryCalories.trim());

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
                            '& .MuiToggleButton-root': { flex: 1 }
                        }}
                    >
                        <ToggleButton value="search">Search</ToggleButton>
                        <ToggleButton value="myFoods">My Foods</ToggleButton>
                        <ToggleButton value="myRecipes">My Recipes</ToggleButton>
                    </ToggleButtonGroup>

                    {error && <Alert severity="error">{error}</Alert>}

                    {mode === 'search' ? (
                        <Stack spacing={2}>
                            <TextField
                                label="Search foods"
                                placeholder="e.g. apple, chicken breast"
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
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                aria-label="Scan barcode"
                                                title="Scan barcode"
                                                onClick={() => setIsScannerOpen(true)}
                                                size="small"
                                                edge="end"
                                                disabled={isSearching || isSubmitting}
                                            >
                                                <QrCodeScannerIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                            {providerName && (
                                <Typography variant="caption" color="text.secondary">
                                    Provider: {providerName}
                                    {providerLookupNote}
                                </Typography>
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
                    ) : mode === 'myFoods' ? (
                        <Stack spacing={2}>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                alignItems={{ xs: 'stretch', sm: 'center' }}
                            >
                                <Button
                                    variant="outlined"
                                    type="button"
                                    onClick={() => setIsNewFoodDialogOpen(true)}
                                    disabled={isSubmitting}
                                >
                                    New Food
                                </Button>
                            </Stack>

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-end' }}>
                                <TextField
                                    label="Search My Foods"
                                    placeholder="e.g. oatmeal, chili"
                                    fullWidth
                                    value={myFoodsQueryText}
                                    onChange={(e) => setMyFoodsQueryText(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            </Stack>

                            {myFoodsQuery.isLoading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" color="text.secondary">
                                        Loading...
                                    </Typography>
                                </Stack>
                            ) : myFoodsQuery.isError ? (
                                <Typography variant="body2" color="text.secondary">
                                    Unable to load your saved foods right now.
                                </Typography>
                            ) : myFoods.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No saved foods yet. Create one with "New Food" to reuse it later.
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
                                        {myFoods.map((food) => {
                                            const secondary = `${Math.round(food.calories_per_serving)} kcal per ${food.serving_size_quantity} ${food.serving_unit_label}`;
                                            return (
                                                <ListItemButton
                                                    key={food.id}
                                                    selected={food.id === selectedMyFoodId}
                                                    onClick={() => setSelectedMyFoodId(food.id)}
                                                    disabled={isSubmitting}
                                                >
                                                    <ListItemText
                                                        primary={food.name}
                                                        secondary={secondary}
                                                        primaryTypographyProps={{ variant: 'body2' }}
                                                        secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                                                    />
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
                                                label={`Servings consumed (${servingDescriptor})`}
                                                type="number"
                                                value={myFoodServingsConsumed}
                                                onChange={(e) => setMyFoodServingsConsumed(e.target.value)}
                                                disabled={isSubmitting}
                                                inputProps={{ min: 0, step: 0.1 }}
                                            />
                                        );
                                    })()}
                                    {myFoodCaloriesPreview !== null && (
                                        <Typography variant="body2" color="text.secondary">
                                            {myFoodCaloriesPreview} calories
                                        </Typography>
                                    )}
                                </Stack>
                            )}

                            <NewMyFoodDialog
                                open={isNewFoodDialogOpen}
                                date={entryLocalDate}
                                mealPeriod={mealPeriod}
                                onClose={() => setIsNewFoodDialogOpen(false)}
                                onSaved={(created) => {
                                    void queryClient.invalidateQueries({ queryKey: ['my-foods'] });
                                    setSelectedMyFoodId(created.id);
                                }}
                                onLogged={() => {
                                    void queryClient.invalidateQueries({ queryKey: ['food'] });
                                    onSuccess?.();
                                }}
                            />
                        </Stack>
                    ) : (
                        <Stack spacing={2}>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                alignItems={{ xs: 'stretch', sm: 'center' }}
                            >
                                <Button
                                    variant="outlined"
                                    type="button"
                                    onClick={() => setIsNewRecipeDialogOpen(true)}
                                    disabled={isSubmitting}
                                >
                                    New Recipe
                                </Button>
                            </Stack>

                            <TextField
                                label="Search My Recipes"
                                placeholder="e.g. chili, overnight oats"
                                fullWidth
                                value={myFoodsQueryText}
                                onChange={(e) => setMyFoodsQueryText(e.target.value)}
                                disabled={isSubmitting}
                            />

                            {myFoodsQuery.isLoading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" color="text.secondary">
                                        Loading...
                                    </Typography>
                                </Stack>
                            ) : myFoodsQuery.isError ? (
                                <Typography variant="body2" color="text.secondary">
                                    Unable to load your saved recipes right now.
                                </Typography>
                            ) : myFoods.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No saved recipes yet. Create one with "New Recipe" to reuse it later.
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
                                                        primaryTypographyProps={{ variant: 'body2' }}
                                                        secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                                                    />
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
                                                label={`Servings consumed (${servingDescriptor})`}
                                                type="number"
                                                value={myFoodServingsConsumed}
                                                onChange={(e) => setMyFoodServingsConsumed(e.target.value)}
                                                disabled={isSubmitting}
                                                inputProps={{ min: 0, step: 0.1 }}
                                            />
                                        );
                                    })()}
                                    {myFoodCaloriesPreview !== null && (
                                        <Typography variant="body2" color="text.secondary">
                                            {myFoodCaloriesPreview} calories
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
                                    onSuccess?.();
                                }}
                            />
                        </Stack>
                    )}

                    {shouldShowMealPeriod && (
                        <FormControl fullWidth>
                            <InputLabel>Meal Period</InputLabel>
                            <Select
                                value={mealPeriod}
                                label="Meal Period"
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

                    {mode === 'myFoods' && (
                        <>
                            <Divider />

                            <Typography variant="subtitle2">Quick entry (not saved)</Typography>

                            <Stack spacing={2}>
                                <TextField
                                    label="Food Name"
                                    fullWidth
                                    value={quickEntryName}
                                    onChange={(e) => setQuickEntryName(e.target.value)}
                                    disabled={isSubmitting}
                                />
                                <TextField
                                    label="Calories"
                                    type="number"
                                    fullWidth
                                    value={quickEntryCalories}
                                    onChange={(e) => setQuickEntryCalories(e.target.value)}
                                    disabled={isSubmitting}
                                    inputProps={{ min: 0, step: 1 }}
                                />
                            </Stack>
                        </>
                    )}
                </Stack>
            </DialogContent>

            <DialogActions>
                {mode === 'myFoods' && (
                    <Button
                        variant="outlined"
                        type="button"
                        onClick={() => void handleAddQuickEntry()}
                        disabled={isSubmitting || !canAddQuickEntry}
                    >
                        {isSubmitting ? 'Adding…' : 'Add Once'}
                    </Button>
                )}

                {mode === 'search' ? (
                    <Button
                        variant="contained"
                        type="button"
                        onClick={() => void handleAddFromSearch()}
                        disabled={isSubmitting || !canAddSelectedSearch}
                    >
                        {isSubmitting ? 'Adding…' : 'Add Selected Food'}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        type="button"
                        onClick={() => void handleAddFromMyFoods()}
                        disabled={isSubmitting || !canAddSelectedMyFood}
                    >
                        {isSubmitting ? 'Adding…' : 'Add to Log'}
                    </Button>
                )}
            </DialogActions>
        </>
    );
};

export default FoodEntryForm;
