import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    ListItemIcon,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import axios from 'axios';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import FoodSearchResultsList from './FoodSearchResultsList';
import MealPeriodIcon from './MealPeriodIcon';
import type { NormalizedFoodItem } from '../types/food';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { getApiErrorMessage } from '../utils/apiError';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

const SEARCH_PAGE_SIZE = 10;

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
    const [mode, setMode] = useState<'manual' | 'search'>('search');
    const [foodName, setFoodName] = useState('');
    const [calories, setCalories] = useState('');
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

    const searchSessionRef = useRef(0);
    const loadMoreLockRef = useRef(false);

    const entryLocalDate = typeof date === 'string' && date.trim().length > 0 ? date.trim() : undefined;

    const mealOptions = MEAL_PERIOD_ORDER.map((value) => ({
        value,
        label: MEAL_PERIOD_LABELS[value],
        icon: <MealPeriodIcon mealPeriod={value} />
    }));

    const selectedItem = useMemo(
        () => searchResults.find((item) => item.id === selectedItemId) || null,
        [searchResults, selectedItemId]
    );

    const shouldShowMealPeriod = mode === 'manual' || (mode === 'search' && searchView === 'selected' && !!selectedItem);

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

    const handleSearch = async () => {
        await performFoodSearch({ query: searchQuery });
    };

    const handleAddManual = async () => {
        const trimmedName = foodName.trim();
        if (!trimmedName || !calories.trim()) {
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/food', {
                name: trimmedName,
                calories,
                meal_period: mealPeriod,
                ...(entryLocalDate ? { date: entryLocalDate } : {})
            });
            setFoodName('');
            setCalories('');
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

    /**
     * Handle form submission so pressing Enter adds the current food entry.
     */
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        if (mode === 'manual') {
            void handleAddManual();
            return;
        }

        if (searchView === 'selected') {
            void handleAddFromSearch();
        }
    };

    const providerLookupNote = supportsBarcodeLookup === false ? ' (barcode lookup unavailable)' : '';
    const searchButtonLabel = isSearching ? 'Searching...' : 'Search';

    // Compute the search panel body outside JSX so the layout stays readable.
    let searchResultsContent: React.ReactNode;

    if (searchResults.length === 0) {
        let emptyMessage = 'No results yet. Search by name or scan a barcode to see matching items.';
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

    return (
        <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <ToggleButtonGroup
                value={mode}
                exclusive
                onChange={(_, next) => next && setMode(next)}
                size="small"
                color="primary"
                disabled={isSubmitting}
            >
                <ToggleButton value="search">Search</ToggleButton>
                <ToggleButton value="manual">Manual Entry</ToggleButton>
            </ToggleButtonGroup>

            {error && <Alert severity="error">{error}</Alert>}

            {mode === 'manual' ? (
                <Stack spacing={2}>
                    <TextField
                        label="Food Name"
                        fullWidth
                        value={foodName}
                        onChange={(e) => setFoodName(e.target.value)}
                        disabled={isSubmitting}
                        required
                    />
                    <TextField
                        label="Calories"
                        type="number"
                        fullWidth
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
                        disabled={isSubmitting}
                        inputProps={{ min: 0, step: 1 }}
                        required
                    />
                </Stack>
            ) : (
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
                                void handleSearch();
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
                    <Button
                        variant="outlined"
                        type="button"
                        onClick={() => void handleSearch()}
                        disabled={isSearching || isSubmitting || !searchQuery.trim()}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        {searchButtonLabel}
                    </Button>
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

            {mode === 'manual' ? (
                <Button
                    variant="contained"
                    type="submit"
                    disabled={isSubmitting || !foodName.trim() || !calories.trim()}
                >
                    {isSubmitting ? 'Adding…' : 'Add Food'}
                </Button>
            ) : (
                <Button
                    variant="contained"
                    type="submit"
                    disabled={isSubmitting || !selectedItem || !computed || searchView !== 'selected'}
                >
                    {isSubmitting ? 'Adding…' : 'Add Selected Food'}
                </Button>
            )}
        </Stack>
    );
};

export default FoodEntryForm;
