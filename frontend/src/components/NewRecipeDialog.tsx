import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    LinearProgress,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import DeleteIcon from '@mui/icons-material/DeleteOutlineRounded';
import axios from 'axios';
import type { MealPeriod } from '../types/mealPeriod';
import type { MyFood } from '../types/myFoods';
import type { NormalizedFoodItem } from '../types/food';
import FatSecretAttributionLink from './FatSecretAttributionLink';
import FoodSearchResultsList from './FoodSearchResultsList';
import { useMyFoodsQuery } from '../queries/myFoods';
import { getApiErrorMessage } from '../utils/apiError';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
    formatMeasureLabelWithQuantity,
    getMeasureCalories,
    getPreferredMeasure,
    getPreferredMeasureLabel
} from '../utils/foodMeasure';
import { useI18n } from '../i18n/useI18n';

/**
 * Dialog for creating a recipe from ingredient snapshots.
 */
const SEARCH_PAGE_SIZE = 10;
const RECIPE_DIALOG_WIDTH_PX = 720; // Gives the ingredient workflow room without turning the dialog into a full page.
const DIALOG_VIEWPORT_GUTTER_PX = { xs: 32, sm: 64 } as const; // Matches MUI dialog edge gutters at compact and desktop sizes.
const RECIPE_META_GRID_COLUMNS = {
    xs: '1fr',
    sm: 'minmax(7.5rem, 0.8fr) minmax(11rem, 1.15fr) minmax(9rem, 1fr)'
} as const; // Keeps the Unit field readable while preventing Serving size from dominating the row.
const INGREDIENT_ROW_GRID_COLUMNS = { xs: '1fr auto', sm: 'minmax(0, 1fr) auto auto' } as const; // Separates name, calories, and delete action.
const SAVED_FOODS_LIST_HEIGHT = { xs: 160, sm: 180 } as const; // Keeps saved matches visible without burying provider results.

const COMMON_SERVING_UNIT_LABELS = [
    'serving',
    'g',
    'ml',
    'fl oz',
    'oz',
    'cup',
    'tbsp',
    'tsp',
    'slice',
    'piece',
    'pack',
    'bottle',
    'can',
    'scoop',
    'bar'
];

type IngredientSearchView = 'results' | 'selected';

type ExternalIngredientDraft = {
    source: 'EXTERNAL';
    sort_order: number;
    name: string;
    calories_total: number;
    external_source?: string;
    external_id?: string;
    brand?: string;
    locale?: string;
    barcode?: string;
    measure_label?: string;
    grams_per_measure?: number;
    measure_quantity?: number;
    grams_total?: number;
};

type MyFoodIngredientDraft = {
    source: 'MY_FOOD';
    sort_order: number;
    my_food_id: number;
    quantity_servings: number;
    name_snapshot: string;
    calories_total: number;
};

type IngredientDraft = ExternalIngredientDraft | MyFoodIngredientDraft;

type FoodSearchResponse = {
    provider?: string;
    items: NormalizedFoodItem[];
};

type Props = {
    open: boolean;
    date?: string;
    mealPeriod: MealPeriod;
    onClose: () => void;
    onSaved?: (created: MyFood) => void;
    onLogged?: () => void;
};

const buildSavedFoodSecondaryText = (food: MyFood): string => {
    return `${Math.round(food.calories_per_serving)} kcal per ${food.serving_size_quantity} ${food.serving_unit_label}`;
};

const NewRecipeDialog: React.FC<Props> = ({ open, date, mealPeriod, onClose, onSaved, onLogged }) => {
    const { t } = useI18n();

    const [name, setName] = useState('');
    const [servingSizeQuantity, setServingSizeQuantity] = useState('1');
    const [servingUnitLabel, setServingUnitLabel] = useState('serving');
    const [yieldServings, setYieldServings] = useState('1');

    const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);

    const [quickIngredientCalories, setQuickIngredientCalories] = useState('');

    const [ingredientSearchQuery, setIngredientSearchQuery] = useState('');
    const debouncedIngredientSearchQuery = useDebouncedValue(ingredientSearchQuery, 350);
    const ingredientSearchText = debouncedIngredientSearchQuery.trim();
    const [ingredientSearchView, setIngredientSearchView] = useState<IngredientSearchView>('results');

    const myFoodsQuery = useMyFoodsQuery(
        { q: ingredientSearchText, type: 'FOOD' },
        { enabled: open && ingredientSearchText.length > 0 }
    );
    const savedFoodOptions = useMemo(() => myFoodsQuery.data ?? [], [myFoodsQuery.data]);
    const [selectedMyFood, setSelectedMyFood] = useState<MyFood | null>(null);
    const [myFoodQuantityServings, setMyFoodQuantityServings] = useState('1');

    const [searchResults, setSearchResults] = useState<NormalizedFoodItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedMeasureLabel, setSelectedMeasureLabel] = useState<string | null>(null);
    const [measureQuantity, setMeasureQuantity] = useState<number>(1);
    const [searchPage, setSearchPage] = useState<number>(1);
    const [hasMoreResults, setHasMoreResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMoreResults, setIsLoadingMoreResults] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [providerName, setProviderName] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const searchSessionRef = useRef(0);
    const loadMoreLockRef = useRef(false);

    const recipeTotals = useMemo(() => {
        const totalCalories = ingredients.reduce((sum, ing) => sum + (Number.isFinite(ing.calories_total) ? ing.calories_total : 0), 0);
        const yieldValue = Number(yieldServings);
        const caloriesPerServing = yieldValue > 0 ? totalCalories / yieldValue : null;
        return { totalCalories, caloriesPerServing };
    }, [ingredients, yieldServings]);

    const canSubmitRecipe = useMemo(() => {
        if (!name.trim()) return false;
        const servingQty = Number(servingSizeQuantity);
        if (!Number.isFinite(servingQty) || servingQty <= 0) return false;
        if (!servingUnitLabel.trim()) return false;
        const yieldValue = Number(yieldServings);
        if (!Number.isFinite(yieldValue) || yieldValue <= 0) return false;
        if (ingredients.length === 0) return false;
        return true;
    }, [ingredients.length, name, servingSizeQuantity, servingUnitLabel, yieldServings]);

    const quickIngredientCaloriesTotal = useMemo(() => {
        const ingredientName = ingredientSearchQuery.trim();
        const calories = Number(quickIngredientCalories);
        if (!ingredientName || !quickIngredientCalories.trim() || !Number.isFinite(calories) || calories < 0) {
            return null;
        }
        return calories;
    }, [ingredientSearchQuery, quickIngredientCalories]);

    const selectedItem = useMemo(
        () => searchResults.find((item) => item.id === selectedItemId) || null,
        [searchResults, selectedItemId]
    );

    const selectedMeasure = useMemo(() => {
        if (!selectedItem) return null;
        const byLabel = selectedItem.availableMeasures.find((m) => m.label === selectedMeasureLabel);
        if (byLabel) return byLabel;
        return getPreferredMeasure(selectedItem);
    }, [selectedItem, selectedMeasureLabel]);

    const computedExternal = useMemo(() => {
        if (!selectedItem || !selectedMeasure) {
            return null;
        }
        return getMeasureCalories(selectedItem, selectedMeasure, measureQuantity);
    }, [measureQuantity, selectedItem, selectedMeasure]);

    const computedMeasureLabel = useMemo(() => {
        if (!selectedMeasure) {
            return '';
        }
        return formatMeasureLabelWithQuantity(selectedMeasure.label, measureQuantity);
    }, [measureQuantity, selectedMeasure]);

    const myFoodIngredientCaloriesTotal = useMemo(() => {
        if (!selectedMyFood) return null;
        const qty = Number(myFoodQuantityServings);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return qty * selectedMyFood.calories_per_serving;
    }, [myFoodQuantityServings, selectedMyFood]);

    const hasSavedFoodRows = savedFoodOptions.length > 0;
    const hasProviderRows = searchResults.length > 0;
    const hasCombinedSearchRows = hasSavedFoodRows || hasProviderRows;
    const isSavedFoodLoading = myFoodsQuery.isLoading && ingredientSearchText.length > 0;
    const isIngredientSearchPending = isSearching || isSavedFoodLoading;
    const showFatSecretAttribution = providerName.trim().toLowerCase() === 'fatsecret';

    const handleClose = () => {
        if (isSubmitting) return;
        setError(null);
        onClose();
    };

    const mergeUniqueResults = useCallback((current: NormalizedFoodItem[], nextPage: NormalizedFoodItem[]) => {
        const nextById = new Map(current.map((item) => [item.id, item]));
        nextPage.forEach((item) => nextById.set(item.id, item));
        return Array.from(nextById.values());
    }, []);

    const fetchFoodSearchPage = useCallback(async (query: string, page: number): Promise<FoodSearchResponse> => {
        const response = await axios.get('/api/food/search', {
            params: { q: query, page, pageSize: SEARCH_PAGE_SIZE }
        });
        return {
            provider: typeof response.data?.provider === 'string' ? response.data.provider : undefined,
            items: Array.isArray(response.data?.items) ? (response.data.items as NormalizedFoodItem[]) : []
        };
    }, []);

    const clearIngredientSelection = useCallback(() => {
        setSelectedMyFood(null);
        setMyFoodQuantityServings('1');
        setSelectedItemId(null);
        setSelectedMeasureLabel(null);
        setMeasureQuantity(1);
        setIngredientSearchView('results');
    }, []);

    const clearSearchResults = useCallback(() => {
        searchSessionRef.current += 1;
        loadMoreLockRef.current = false;
        setSearchResults([]);
        setSearchPage(1);
        setHasMoreResults(false);
        setIsSearching(false);
        setIsLoadingMoreResults(false);
        setHasSearched(false);
        setProviderName('');
        clearIngredientSelection();
    }, [clearIngredientSelection]);

    const performExternalSearch = useCallback(
        async (query: string) => {
            const trimmedQuery = query.trim();
            if (!trimmedQuery || isSubmitting) return;

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
            setProviderName('');
            clearIngredientSelection();

            try {
                const firstPage = await fetchFoodSearchPage(trimmedQuery, 1);
                if (searchSessionRef.current !== sessionId) return;

                setProviderName(firstPage.provider || '');
                setSearchResults(firstPage.items);
                setHasMoreResults(firstPage.items.length === SEARCH_PAGE_SIZE);
            } catch (err) {
                setError(getApiErrorMessage(err) ?? t('foodEntry.search.error.searchFailed'));
            } finally {
                if (searchSessionRef.current === sessionId) {
                    setIsSearching(false);
                }
            }
        },
        [clearIngredientSelection, fetchFoodSearchPage, isSubmitting, t]
    );

    useEffect(() => {
        if (!open) return;

        if (!ingredientSearchText) {
            clearSearchResults();
            return;
        }

        void performExternalSearch(ingredientSearchText);
    }, [clearSearchResults, ingredientSearchText, open, performExternalSearch]);

    const loadMoreExternalResults = useCallback(async () => {
        const query = ingredientSearchQuery.trim();
        if (!query || !hasMoreResults || isSearching || isLoadingMoreResults || isSubmitting) {
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
            const nextPage = await fetchFoodSearchPage(query, nextPageNumber);
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
    }, [
        fetchFoodSearchPage,
        hasMoreResults,
        ingredientSearchQuery,
        isLoadingMoreResults,
        isSearching,
        isSubmitting,
        mergeUniqueResults,
        searchPage,
        t
    ]);

    const selectSavedFood = useCallback(
        (food: MyFood) => {
            if (isSubmitting) return;
            setSelectedMyFood(food);
            setMyFoodQuantityServings('1');
            setSelectedItemId(null);
            setSelectedMeasureLabel(null);
            setMeasureQuantity(1);
            setIngredientSearchView('selected');
        },
        [isSubmitting]
    );

    const selectExternalResult = useCallback(
        (item: NormalizedFoodItem) => {
            if (isSubmitting) return;
            setSelectedItemId(item.id);
            setSelectedMeasureLabel(getPreferredMeasureLabel(item));
            setMeasureQuantity(1);
            setSelectedMyFood(null);
            setMyFoodQuantityServings('1');
            setIngredientSearchView('selected');
        },
        [isSubmitting]
    );

    const addQuickIngredient = () => {
        const trimmedName = ingredientSearchQuery.trim();
        if (!trimmedName || quickIngredientCaloriesTotal === null) return;

        setIngredients((current) => [
            ...current,
            {
                source: 'EXTERNAL',
                sort_order: current.length + 1,
                name: trimmedName,
                calories_total: quickIngredientCaloriesTotal
            }
        ]);

        setQuickIngredientCalories('');
        setIngredientSearchQuery('');
        clearSearchResults();
    };

    const addMyFoodIngredient = () => {
        if (!selectedMyFood) return;
        const qty = Number(myFoodQuantityServings);
        if (!Number.isFinite(qty) || qty <= 0) return;

        setIngredients((current) => [
            ...current,
            {
                source: 'MY_FOOD',
                sort_order: current.length + 1,
                my_food_id: selectedMyFood.id,
                quantity_servings: qty,
                name_snapshot: selectedMyFood.name,
                calories_total: qty * selectedMyFood.calories_per_serving
            }
        ]);

        clearIngredientSelection();
    };

    const addExternalIngredient = () => {
        if (!selectedItem || !selectedMeasure || !computedExternal) return;

        setIngredients((current) => [
            ...current,
            {
                source: 'EXTERNAL',
                sort_order: current.length + 1,
                name: selectedItem.description,
                calories_total: computedExternal.calories,
                external_source: selectedItem.source,
                external_id: selectedItem.id,
                brand: selectedItem.brand,
                locale: selectedItem.locale,
                barcode: selectedItem.barcode,
                measure_label: selectedMeasure.label,
                grams_per_measure: selectedMeasure.gramWeight,
                measure_quantity: measureQuantity,
                grams_total: computedExternal.grams
            }
        ]);

        clearIngredientSelection();
    };

    const removeIngredient = (idx: number) => {
        setIngredients((current) => current.filter((_, i) => i !== idx).map((ing, i) => ({ ...ing, sort_order: i + 1 })));
    };

    const createRecipe = async (): Promise<MyFood> => {
        const res = await axios.post('/api/my-foods/recipes', {
            name: name.trim(),
            serving_size_quantity: Number(servingSizeQuantity),
            serving_unit_label: servingUnitLabel.trim(),
            yield_servings: Number(yieldServings),
            ingredients: ingredients.map((ing) => {
                if (ing.source === 'MY_FOOD') {
                    return {
                        source: ing.source,
                        sort_order: ing.sort_order,
                        my_food_id: ing.my_food_id,
                        quantity_servings: ing.quantity_servings
                    };
                }

                return {
                    source: ing.source,
                    sort_order: ing.sort_order,
                    name: ing.name,
                    calories_total: ing.calories_total,
                    external_source: ing.external_source,
                    external_id: ing.external_id,
                    brand: ing.brand,
                    locale: ing.locale,
                    barcode: ing.barcode,
                    measure_label: ing.measure_label,
                    grams_per_measure: ing.grams_per_measure,
                    measure_quantity: ing.measure_quantity,
                    grams_total: ing.grams_total
                };
            })
        });
        return res.data as MyFood;
    };

    const logMyFood = async (myFoodId: number) => {
        await axios.post('/api/food', {
            my_food_id: myFoodId,
            servings_consumed: 1,
            meal_period: mealPeriod,
            ...(date ? { date } : {})
        });
    };

    const handleSave = async (opts: { logAfterSave: boolean }) => {
        if (!canSubmitRecipe) return;

        setIsSubmitting(true);
        setError(null);
        try {
            const created = await createRecipe();
            onSaved?.(created);

            if (opts.logAfterSave) {
                await logMyFood(created.id);
                onLogged?.();
            }

            setName('');
            setServingSizeQuantity('1');
            setServingUnitLabel('serving');
            setYieldServings('1');
            setIngredients([]);
            setQuickIngredientCalories('');
            setIngredientSearchQuery('');
            clearSearchResults();
            onClose();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to save this recipe right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderSearchEmptyState = () => {
        let emptyMessage = t('foodEntry.search.empty.start');
        if (hasSearched || ingredientSearchText) {
            emptyMessage = t('foodEntry.search.empty.noMatches');
        }

        return (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {emptyMessage}
            </Typography>
        );
    };

    const renderSelectedSavedFood = () => {
        if (!selectedMyFood) return null;
        const servingDescriptor = `${selectedMyFood.serving_size_quantity} ${selectedMyFood.serving_unit_label}`;

        return (
            <Stack spacing={1.5}>
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
                            {selectedMyFood.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {buildSavedFoodSecondaryText(selectedMyFood)}
                        </Typography>
                    </Box>
                    <Button
                        variant="text"
                        type="button"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={clearIngredientSelection}
                    >
                        {t('foodEntry.search.selected.back')}
                    </Button>
                </Box>

                <TextField
                    label={t('foodEntry.myFoods.servingsConsumed', { serving: servingDescriptor })}
                    type="number"
                    value={myFoodQuantityServings}
                    onChange={(e) => setMyFoodQuantityServings(e.target.value)}
                    disabled={isSubmitting}
                    slotProps={{
                        htmlInput: { min: 0, step: 0.1 }
                    }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                    {myFoodIngredientCaloriesTotal !== null && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1 }}>
                            Adds {Math.round(myFoodIngredientCaloriesTotal)} kcal
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={addMyFoodIngredient}
                        disabled={isSubmitting || myFoodIngredientCaloriesTotal === null}
                    >
                        Add ingredient
                    </Button>
                </Stack>
            </Stack>
        );
    };

    const renderSelectedProviderFood = () => {
        if (!selectedItem) return null;

        return (
            <Stack spacing={1.5}>
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
                        onClick={clearIngredientSelection}
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
                    value={measureQuantity}
                    onChange={(e) => setMeasureQuantity(parseFloat(e.target.value) || 0)}
                    disabled={isSubmitting || !selectedMeasure}
                    slotProps={{
                        htmlInput: { min: 0, step: 0.5 }
                    }}
                />

                {computedExternal ? (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {selectedItem.nutrientsPer100g
                                    ? t('foodEntry.search.caloriesEstimated')
                                    : t('foodEntry.search.caloriesUnavailable')}
                            </Typography>
                            <Typography variant="subtitle1" sx={{ mt: 0.5 }}>
                                {t('foodEntry.search.computedSummary', {
                                    calories: computedExternal.calories,
                                    measureLabel: computedMeasureLabel
                                })}
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={addExternalIngredient}
                            disabled={isSubmitting}
                        >
                            Add ingredient
                        </Button>
                    </Stack>
                ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('foodEntry.search.caloriesUnavailable')}
                    </Typography>
                )}
            </Stack>
        );
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            fullWidth
            maxWidth="md"
            sx={{
                '& .MuiDialog-paper': {
                    width: { sm: RECIPE_DIALOG_WIDTH_PX },
                    maxHeight: {
                        xs: `calc(100% - ${DIALOG_VIEWPORT_GUTTER_PX.xs}px)`,
                        sm: `calc(100% - ${DIALOG_VIEWPORT_GUTTER_PX.sm}px)`
                    }
                }
            }}
        >
            <DialogTitle>{t('foodEntry.myRecipes.newRecipe')}</DialogTitle>
            <DialogContent dividers sx={{ flex: 1, overflowY: 'auto' }}>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Recipe name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        autoFocus
                        disabled={isSubmitting}
                        required
                    />

                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: RECIPE_META_GRID_COLUMNS,
                            gap: 1
                        }}
                    >
                        <TextField
                            label="Serving size"
                            type="number"
                            value={servingSizeQuantity}
                            onChange={(e) => setServingSizeQuantity(e.target.value)}
                            fullWidth
                            disabled={isSubmitting}
                            required
                            slotProps={{
                                htmlInput: { min: 0, step: 0.1 }
                            }}
                        />
                        <Autocomplete
                            freeSolo
                            options={COMMON_SERVING_UNIT_LABELS}
                            value={servingUnitLabel}
                            onChange={(_, next) => setServingUnitLabel(typeof next === 'string' ? next : '')}
                            onInputChange={(_, next) => setServingUnitLabel(next)}
                            sx={{ minWidth: 0 }}
                            renderInput={(params) => (
                                <TextField {...params} label="Unit" fullWidth disabled={isSubmitting} required />
                            )}
                        />
                        <TextField
                            label="Yield (servings)"
                            type="number"
                            value={yieldServings}
                            onChange={(e) => setYieldServings(e.target.value)}
                            fullWidth
                            disabled={isSubmitting}
                            required
                            slotProps={{
                                htmlInput: { min: 0, step: 0.1 }
                            }}
                        />
                    </Box>

                    <Box
                        sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            p: 1.5
                        }}
                    >
                        <Typography variant="subtitle2">Ingredients</Typography>
                        {ingredients.length === 0 ? (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                Add ingredients from your My Foods library or by searching the food database.
                            </Typography>
                        ) : (
                            <List dense disablePadding sx={{ mt: 0.5 }}>
                                {ingredients.map((ing, idx) => {
                                    const ingredientName = ing.source === 'MY_FOOD' ? ing.name_snapshot : ing.name;
                                    const secondary =
                                        ing.source === 'MY_FOOD'
                                            ? `${ing.quantity_servings} servings`
                                            : ing.measure_label
                                              ? `${ing.measure_quantity ?? 1} x ${ing.measure_label}`
                                              : undefined;

                                    return (
                                        <ListItem
                                            key={`${ing.source}-${idx}`}
                                            disableGutters
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: INGREDIENT_ROW_GRID_COLUMNS,
                                                gap: { xs: 0.5, sm: 1.5 },
                                                alignItems: 'center',
                                                py: 0.75
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                                    {ingredientName}
                                                </Typography>
                                                {secondary && (
                                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                        {secondary}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: 'text.secondary',
                                                    gridColumn: { xs: '1 / 2', sm: 'auto' },
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {Math.round(ing.calories_total)} kcal
                                            </Typography>
                                            <Tooltip title={t('common.delete')}>
                                                <span>
                                                    <IconButton
                                                        aria-label={t('common.delete')}
                                                        size="small"
                                                        onClick={() => removeIngredient(idx)}
                                                        disabled={isSubmitting}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        )}

                        <Divider sx={{ my: 1.5 }} />

                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            sx={{
                                alignItems: { xs: 'stretch', sm: 'center' }
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    color: 'text.secondary',
                                    flexGrow: 1
                                }}
                            >
                                Total: {Math.round(recipeTotals.totalCalories)} kcal
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {recipeTotals.caloriesPerServing !== null
                                    ? `${Math.round(recipeTotals.caloriesPerServing)} kcal/serving`
                                    : '-'}
                            </Typography>
                        </Stack>
                    </Box>

                    <Box
                        sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            p: 1.5
                        }}
                    >
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2">Add ingredient</Typography>
                            <TextField
                                label={t('foodEntry.search.label')}
                                placeholder={t('foodEntry.search.placeholder')}
                                value={ingredientSearchQuery}
                                onChange={(e) => setIngredientSearchQuery(e.target.value)}
                                disabled={isSubmitting}
                                fullWidth
                            />

                            {ingredientSearchView === 'results' && ingredientSearchQuery.trim() && (
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
                                            {t('foodEntry.quickEntry.inlineTitle', { name: ingredientSearchQuery.trim() })}
                                        </Typography>
                                        <TextField
                                            label={t('foodEntry.quickEntry.calories')}
                                            type="number"
                                            value={quickIngredientCalories}
                                            onChange={(e) => setQuickIngredientCalories(e.target.value)}
                                            disabled={isSubmitting}
                                            sx={{ minWidth: { sm: 160 } }}
                                            slotProps={{
                                                htmlInput: { min: 0, step: 1 }
                                            }}
                                        />
                                        <Button
                                            variant="outlined"
                                            startIcon={<AddIcon />}
                                            onClick={addQuickIngredient}
                                            disabled={isSubmitting || quickIngredientCaloriesTotal === null}
                                            sx={{ whiteSpace: 'nowrap' }}
                                        >
                                            Add ingredient
                                        </Button>
                                    </Stack>
                                    {quickIngredientCaloriesTotal !== null && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            Adds {Math.round(quickIngredientCaloriesTotal)} kcal
                                        </Typography>
                                    )}
                                </Box>
                            )}

                            {providerName && (
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {t('foodEntry.search.providerLabel', { provider: providerName })}
                                </Typography>
                            )}
                            {showFatSecretAttribution && (
                                <Box
                                    sx={(theme) => ({
                                        mt: -0.5,
                                        fontSize: theme.typography.caption.fontSize
                                    })}
                                >
                                    <FatSecretAttributionLink />
                                </Box>
                            )}

                            {ingredientSearchView === 'selected' && selectedMyFood ? (
                                renderSelectedSavedFood()
                            ) : ingredientSearchView === 'selected' && selectedItem ? (
                                renderSelectedProviderFood()
                            ) : (
                                <Stack spacing={1.25}>
                                    {isIngredientSearchPending && !hasCombinedSearchRows && (
                                        <LinearProgress aria-label={t('foodEntry.search.empty.searching')} />
                                    )}

                                    {!hasCombinedSearchRows && !isIngredientSearchPending ? (
                                        renderSearchEmptyState()
                                    ) : (
                                        <>
                                            {hasSavedFoodRows && (
                                                <Stack spacing={1}>
                                                    <Typography variant="subtitle2">{t('foodEntry.mode.myFoods')}</Typography>
                                                    <Box
                                                        sx={{
                                                            border: 1,
                                                            borderColor: 'divider',
                                                            borderRadius: 1,
                                                            overflow: 'hidden',
                                                            maxHeight: SAVED_FOODS_LIST_HEIGHT,
                                                            overflowY: 'auto'
                                                        }}
                                                    >
                                                        <List dense disablePadding>
                                                            {savedFoodOptions.map((food) => (
                                                                <ListItemButton
                                                                    key={food.id}
                                                                    selected={selectedMyFood?.id === food.id}
                                                                    onClick={() => selectSavedFood(food)}
                                                                    disabled={isSubmitting}
                                                                    sx={{ alignItems: 'flex-start' }}
                                                                >
                                                                    <ListItemText
                                                                        primary={food.name}
                                                                        secondary={buildSavedFoodSecondaryText(food)}
                                                                        slotProps={{
                                                                            primary: { variant: 'body2' },
                                                                            secondary: {
                                                                                variant: 'caption',
                                                                                color: 'text.secondary'
                                                                            }
                                                                        }}
                                                                    />
                                                                </ListItemButton>
                                                            ))}
                                                        </List>
                                                    </Box>
                                                </Stack>
                                            )}

                                            {hasProviderRows && (
                                                <Stack spacing={1}>
                                                    <Typography variant="subtitle2">{t('foodEntry.search.results.title')}</Typography>
                                                    <FoodSearchResultsList
                                                        items={searchResults}
                                                        selectedItemId={selectedItemId}
                                                        hasMore={hasMoreResults}
                                                        isLoading={isSearching}
                                                        isLoadingMore={isLoadingMoreResults}
                                                        onLoadMore={() => void loadMoreExternalResults()}
                                                        onSelect={selectExternalResult}
                                                    />
                                                </Stack>
                                            )}
                                        </>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={isSubmitting}>
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="outlined"
                    onClick={() => void handleSave({ logAfterSave: false })}
                    disabled={!canSubmitRecipe || isSubmitting}
                >
                    {t('common.save')}
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void handleSave({ logAfterSave: true })}
                    disabled={!canSubmitRecipe || isSubmitting}
                >
                    Save &amp; Log
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default NewRecipeDialog;
