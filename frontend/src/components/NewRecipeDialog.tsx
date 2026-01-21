import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
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
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import axios from 'axios';
import type { MealPeriod } from '../types/mealPeriod';
import type { MyFood } from '../types/myFoods';
import type { NormalizedFoodItem } from '../types/food';
import FoodSearchResultsList from './FoodSearchResultsList';
import { useMyFoodsQuery } from '../queries/myFoods';
import { getApiErrorMessage } from '../utils/apiError';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getMeasureCalories, getPreferredMeasure, getPreferredMeasureLabel } from '../utils/foodMeasure';

/**
 * Dialog for creating a recipe from ingredient snapshots.
 */
const SEARCH_PAGE_SIZE = 10;

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

type Props = {
    open: boolean;
    date?: string;
    mealPeriod: MealPeriod;
    onClose: () => void;
    onSaved?: (created: MyFood) => void;
    onLogged?: () => void;
};

const NewRecipeDialog: React.FC<Props> = ({ open, date, mealPeriod, onClose, onSaved, onLogged }) => {
    const [name, setName] = useState('');
    const [servingSizeQuantity, setServingSizeQuantity] = useState('1');
    const [servingUnitLabel, setServingUnitLabel] = useState('serving');
    const [yieldServings, setYieldServings] = useState('1');

    const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleClose = () => {
        if (isSubmitting) return;
        setError(null);
        onClose();
    };

    // --- Add ingredient from My Foods ---
    const [myFoodQuery, setMyFoodQuery] = useState('');
    const debouncedMyFoodQuery = useDebouncedValue(myFoodQuery, 250);
    const myFoodsQuery = useMyFoodsQuery({ q: debouncedMyFoodQuery, type: 'FOOD' }, { enabled: open });
    const myFoodOptions = myFoodsQuery.data ?? [];
    const [selectedMyFood, setSelectedMyFood] = useState<MyFood | null>(null);
    const [myFoodQuantityServings, setMyFoodQuantityServings] = useState('1');

    const myFoodIngredientCaloriesTotal = useMemo(() => {
        if (!selectedMyFood) return null;
        const qty = Number(myFoodQuantityServings);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return qty * selectedMyFood.calories_per_serving;
    }, [myFoodQuantityServings, selectedMyFood]);

    const addMyFoodIngredient = () => {
        if (!selectedMyFood) return;
        const qty = Number(myFoodQuantityServings);
        if (!Number.isFinite(qty) || qty <= 0) return;

        setIngredients((current) => {
            const sort_order = current.length + 1;
            const calories_total = qty * selectedMyFood.calories_per_serving;
            return [
                ...current,
                {
                    source: 'MY_FOOD',
                    sort_order,
                    my_food_id: selectedMyFood.id,
                    quantity_servings: qty,
                    name_snapshot: selectedMyFood.name,
                    calories_total
                }
            ];
        });

        setSelectedMyFood(null);
        setMyFoodQuantityServings('1');
    };

    // --- Add ingredient from external search ---
    const [externalQuery, setExternalQuery] = useState('');
    const debouncedExternalQuery = useDebouncedValue(externalQuery, 350);
    const [searchResults, setSearchResults] = useState<NormalizedFoodItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedMeasureLabel, setSelectedMeasureLabel] = useState<string | null>(null);
    const [measureQuantity, setMeasureQuantity] = useState<number>(1);
    const [searchPage, setSearchPage] = useState<number>(1);
    const [hasMoreResults, setHasMoreResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMoreResults, setIsLoadingMoreResults] = useState(false);

    const searchSessionRef = useRef(0);
    const loadMoreLockRef = useRef(false);

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

    /**
     * Merge paginated results without duplicating items when upstream providers repeat IDs across pages.
     */
    const mergeUniqueResults = useCallback((current: NormalizedFoodItem[], nextPage: NormalizedFoodItem[]) => {
        const nextById = new Map(current.map((item) => [item.id, item]));
        nextPage.forEach((item) => nextById.set(item.id, item));
        return Array.from(nextById.values());
    }, []);

    /**
     * Pick a reasonable default measure label so the dropdown is pre-populated after selection.
     */
    const getDefaultMeasureLabel = useCallback((item: NormalizedFoodItem): string | null => {
        return getPreferredMeasureLabel(item);
    }, []);

    const fetchFoodSearchPage = useCallback(async (query: string, page: number) => {
        const response = await axios.get('/api/food/search', {
            params: { q: query, page, pageSize: SEARCH_PAGE_SIZE }
        });
        return {
            items: Array.isArray(response.data?.items) ? (response.data.items as NormalizedFoodItem[]) : []
        };
    }, []);

    const performExternalSearch = useCallback(
        async (query: string) => {
            const trimmedQuery = query.trim();
            if (!trimmedQuery) return;

            searchSessionRef.current += 1;
            const sessionId = searchSessionRef.current;
            loadMoreLockRef.current = false;

            setIsSearching(true);
            setSearchResults([]);
            setSearchPage(1);
            setHasMoreResults(false);
            setIsLoadingMoreResults(false);
            setSelectedItemId(null);
            setSelectedMeasureLabel(null);
            setMeasureQuantity(1);

            try {
                const firstPage = await fetchFoodSearchPage(trimmedQuery, 1);
                if (searchSessionRef.current !== sessionId) return;

                setSearchResults(firstPage.items);
                setHasMoreResults(firstPage.items.length === SEARCH_PAGE_SIZE);
            } catch (err) {
                setError(getApiErrorMessage(err) ?? 'Search failed. Please try again.');
            } finally {
                if (searchSessionRef.current === sessionId) {
                    setIsSearching(false);
                }
            }
        },
        [fetchFoodSearchPage]
    );

    const clearExternalSearchState = useCallback(() => {
        searchSessionRef.current += 1;
        loadMoreLockRef.current = false;
        setSearchResults([]);
        setSelectedItemId(null);
        setSelectedMeasureLabel(null);
        setMeasureQuantity(1);
        setSearchPage(1);
        setHasMoreResults(false);
        setIsSearching(false);
        setIsLoadingMoreResults(false);
    }, []);

    // Trigger external ingredient searches automatically while typing.
    useEffect(() => {
        if (!open) return;

        const query = debouncedExternalQuery.trim();
        if (!query) {
            clearExternalSearchState();
            return;
        }

        void performExternalSearch(query);
    }, [clearExternalSearchState, debouncedExternalQuery, open, performExternalSearch]);

    const loadMoreExternalResults = useCallback(async () => {
        if (!externalQuery.trim() || !hasMoreResults || isSearching || isLoadingMoreResults) {
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
            const nextPage = await fetchFoodSearchPage(externalQuery.trim(), nextPageNumber);
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
    }, [externalQuery, fetchFoodSearchPage, hasMoreResults, isLoadingMoreResults, isSearching, mergeUniqueResults, searchPage]);

    const selectExternalResult = (item: NormalizedFoodItem) => {
        setSelectedItemId(item.id);
        setSelectedMeasureLabel(getDefaultMeasureLabel(item));
        setMeasureQuantity(1);
    };

    const addExternalIngredient = () => {
        if (!selectedItem || !selectedMeasure || !computedExternal) return;
        const sort_order = ingredients.length + 1;

        setIngredients((current) => [
            ...current,
            {
                source: 'EXTERNAL',
                sort_order,
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

        setSelectedItemId(null);
        setSelectedMeasureLabel(null);
        setMeasureQuantity(1);
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
            onClose();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to save this recipe right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const externalPanelDisabled = isSubmitting;

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>New Recipe</DialogTitle>
            <DialogContent>
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

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                            label="Serving size"
                            type="number"
                            value={servingSizeQuantity}
                            onChange={(e) => setServingSizeQuantity(e.target.value)}
                            inputProps={{ min: 0, step: 0.1 }}
                            fullWidth
                            disabled={isSubmitting}
                            required
                        />
                        <Autocomplete
                            freeSolo
                            options={COMMON_SERVING_UNIT_LABELS}
                            value={servingUnitLabel}
                            onChange={(_, next) => setServingUnitLabel(typeof next === 'string' ? next : '')}
                            onInputChange={(_, next) => setServingUnitLabel(next)}
                            renderInput={(params) => (
                                <TextField {...params} label="Unit" fullWidth disabled={isSubmitting} required />
                            )}
                        />
                        <TextField
                            label="Yield (servings)"
                            type="number"
                            value={yieldServings}
                            onChange={(e) => setYieldServings(e.target.value)}
                            inputProps={{ min: 0, step: 0.1 }}
                            fullWidth
                            disabled={isSubmitting}
                            required
                        />
                    </Stack>

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
                            <Typography variant="body2" color="text.secondary">
                                Add ingredients from your My Foods library or by searching the food database.
                            </Typography>
                        ) : (
                            <List dense disablePadding>
                                {ingredients.map((ing, idx) => {
                                    const secondary =
                                        ing.source === 'MY_FOOD'
                                            ? `${ing.quantity_servings} servings`
                                            : ing.measure_label
                                              ? `${ing.measure_quantity ?? 1} x ${ing.measure_label}`
                                              : undefined;
                                    return (
                                        <ListItem
                                            key={`${ing.source}-${idx}`}
                                            secondaryAction={
                                                <Button
                                                    size="small"
                                                    onClick={() => removeIngredient(idx)}
                                                    disabled={isSubmitting}
                                                >
                                                    Remove
                                                </Button>
                                            }
                                            sx={{ px: 0 }}
                                        >
                                            <ListItemText
                                                primary={ing.source === 'MY_FOOD' ? ing.name_snapshot : ing.name}
                                                secondary={secondary}
                                            />
                                            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, whiteSpace: 'nowrap' }}>
                                                {Math.round(ing.calories_total)} kcal
                                            </Typography>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        )}

                        <Divider sx={{ my: 1.5 }} />

                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            alignItems={{ xs: 'stretch', sm: 'center' }}
                        >
                            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                                Total: {Math.round(recipeTotals.totalCalories)} kcal
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {recipeTotals.caloriesPerServing !== null
                                    ? `${Math.round(recipeTotals.caloriesPerServing)} kcal/serving`
                                    : '—'}
                            </Typography>
                        </Stack>
                    </Box>

                    <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">Add from My Foods</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={1.5}>
                                <TextField
                                    label="Search My Foods"
                                    value={myFoodQuery}
                                    onChange={(e) => setMyFoodQuery(e.target.value)}
                                    disabled={isSubmitting}
                                />
                                <Autocomplete
                                    options={myFoodOptions}
                                    value={selectedMyFood}
                                    onChange={(_, next) => setSelectedMyFood(next)}
                                    getOptionLabel={(option) => option.name}
                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Select a food"
                                            disabled={isSubmitting || myFoodsQuery.isLoading}
                                        />
                                    )}
                                />
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <TextField
                                        label="Quantity (servings)"
                                        type="number"
                                        value={myFoodQuantityServings}
                                        onChange={(e) => setMyFoodQuantityServings(e.target.value)}
                                        inputProps={{ min: 0, step: 0.1 }}
                                        disabled={isSubmitting || !selectedMyFood}
                                        fullWidth
                                    />
                                    <Button
                                        variant="outlined"
                                        onClick={addMyFoodIngredient}
                                        disabled={isSubmitting || !selectedMyFood || myFoodIngredientCaloriesTotal === null}
                                        sx={{ whiteSpace: 'nowrap' }}
                                    >
                                        Add
                                    </Button>
                                </Stack>
                                {selectedMyFood && myFoodIngredientCaloriesTotal !== null && (
                                    <Typography variant="caption" color="text.secondary">
                                        Adds {Math.round(myFoodIngredientCaloriesTotal)} kcal
                                    </Typography>
                                )}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">Add from Search</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={1.5}>
                                <TextField
                                    label="Search foods"
                                    placeholder="Start typing to search (e.g. chicken breast)"
                                    value={externalQuery}
                                    onChange={(e) => setExternalQuery(e.target.value)}
                                    disabled={externalPanelDisabled}
                                    fullWidth
                                />

                                {searchResults.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        {isSearching
                                            ? 'Searching...'
                                            : 'Type a search term to find an ingredient and add it to the recipe.'}
                                    </Typography>
                                ) : (
                                    <FoodSearchResultsList
                                        items={searchResults}
                                        selectedItemId={selectedItemId}
                                        hasMore={hasMoreResults}
                                        isLoading={isSearching}
                                        isLoadingMore={isLoadingMoreResults}
                                        onLoadMore={() => void loadMoreExternalResults()}
                                        onSelect={selectExternalResult}
                                    />
                                )}

                                {selectedItem && (
                                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                                        <Typography variant="subtitle2">Selected</Typography>
                                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                            {selectedItem.description}
                                            {selectedItem.brand ? ` (${selectedItem.brand})` : ''}
                                        </Typography>

                                        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                                            <FormControl fullWidth>
                                                <InputLabel>Measure</InputLabel>
                                                <Select
                                                    value={selectedMeasure?.label || ''}
                                                    label="Measure"
                                                    onChange={(e) => setSelectedMeasureLabel(e.target.value)}
                                                    disabled={externalPanelDisabled}
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
                                                value={measureQuantity}
                                                onChange={(e) => setMeasureQuantity(parseFloat(e.target.value) || 0)}
                                                disabled={externalPanelDisabled || !selectedMeasure}
                                                inputProps={{ min: 0, step: 0.5 }}
                                            />

                                            {computedExternal ? (
                                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Adds {Math.round(computedExternal.calories)} kcal
                                                    </Typography>
                                                    <Button
                                                        variant="outlined"
                                                        onClick={addExternalIngredient}
                                                        disabled={externalPanelDisabled}
                                                    >
                                                        Add ingredient
                                                    </Button>
                                                </Stack>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">
                                                    Calories unavailable for this item.
                                                </Typography>
                                            )}
                                        </Stack>
                                    </Box>
                                )}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    variant="outlined"
                    onClick={() => void handleSave({ logAfterSave: false })}
                    disabled={!canSubmitRecipe || isSubmitting}
                >
                    Save
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
