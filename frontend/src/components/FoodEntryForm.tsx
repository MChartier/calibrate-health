import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import axios from 'axios';
import EggAltIcon from '@mui/icons-material/EggAlt';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import IcecreamIcon from '@mui/icons-material/Icecream';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import NightlifeIcon from '@mui/icons-material/Nightlife';
import { ListItemIcon } from '@mui/material';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

type FoodDataSource = 'usda' | 'openFoodFacts';

type FoodMeasure = {
    label: string;
    gramWeight?: number;
    quantity?: number;
    unit?: string;
};

type NormalizedFoodItem = {
    id: string;
    source: FoodDataSource;
    description: string;
    brand?: string;
    barcode?: string;
    availableMeasures: FoodMeasure[];
    nutrientsPer100g?: {
        calories: number;
        protein?: number;
        fat?: number;
        carbs?: number;
    };
    nutrientsForRequest?: {
        grams: number;
        nutrients: {
            calories: number;
            protein?: number;
            fat?: number;
            carbs?: number;
        };
    };
};

const FoodEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const [mode, setMode] = useState<'manual' | 'search'>('manual');
    const [foodName, setFoodName] = useState('');
    const [calories, setCalories] = useState('');
    const [mealPeriod, setMealPeriod] = useState('Breakfast');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NormalizedFoodItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedMeasureLabel, setSelectedMeasureLabel] = useState<string | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [providerName, setProviderName] = useState<string>('');

    const entryDate = date ? `${date}T12:00:00` : new Date();

    const mealOptions = [
        { value: 'Breakfast', label: 'Breakfast', icon: <EggAltIcon htmlColor="#ff9800" /> },
        { value: 'Morning Snack', label: 'Morning Snack', icon: <BakeryDiningIcon htmlColor="#4caf50" /> },
        { value: 'Lunch', label: 'Lunch', icon: <LunchDiningIcon htmlColor="#3f51b5" /> },
        { value: 'Afternoon Snack', label: 'Afternoon Snack', icon: <IcecreamIcon htmlColor="#8bc34a" /> },
        { value: 'Dinner', label: 'Dinner', icon: <DinnerDiningIcon htmlColor="#9c27b0" /> },
        { value: 'Evening Snack', label: 'Evening Snack', icon: <NightlifeIcon htmlColor="#e91e63" /> }
    ];

    const selectedItem = useMemo(
        () => searchResults.find((item) => item.id === selectedItemId) || null,
        [searchResults, selectedItemId]
    );

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

    const resetSearchSelection = (items: NormalizedFoodItem[]) => {
        if (items.length === 0) {
            setSelectedItemId(null);
            setSelectedMeasureLabel(null);
            return;
        }
        const first = items[0];
        setSelectedItemId(first.id);
        const firstMeasure = first.availableMeasures.find((m) => m.gramWeight);
        setSelectedMeasureLabel(firstMeasure?.label || null);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        setError(null);
        try {
            const response = await axios.get('/api/food/search', {
                params: { q: searchQuery.trim() }
            });
            const items: NormalizedFoodItem[] = Array.isArray(response.data?.items) ? response.data.items : [];
            setProviderName(response.data?.provider || '');
            setSearchResults(items);
            resetSearchSelection(items);
        } catch (err) {
            console.error(err);
            setError('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddManual = async () => {
        await axios.post('/api/food', {
            name: foodName,
            calories,
            meal_period: mealPeriod,
            date: entryDate
        });
        setFoodName('');
        setCalories('');
        onSuccess?.();
    };

    const handleAddFromSearch = async () => {
        if (!selectedItem || !computed) return;
        await axios.post('/api/food', {
            name: selectedItem.description,
            calories: computed.calories,
            meal_period: mealPeriod,
            date: entryDate
        });
        onSuccess?.();
    };

    return (
        <Stack spacing={2}>
            <ToggleButtonGroup
                value={mode}
                exclusive
                onChange={(_, next) => next && setMode(next)}
                size="small"
                color="primary"
            >
                <ToggleButton value="manual">Manual calories</ToggleButton>
                <ToggleButton value="search">Search provider</ToggleButton>
            </ToggleButtonGroup>

            {mode === 'manual' ? (
                <Stack spacing={2}>
                    <TextField
                        label="Food Name"
                        fullWidth
                        value={foodName}
                        onChange={(e) => setFoodName(e.target.value)}
                    />
                    <TextField
                        label="Calories"
                        type="number"
                        fullWidth
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleSearch();
                            }
                        }}
                    />
                    <Button variant="outlined" onClick={() => void handleSearch()} disabled={isSearching}>
                        {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                    {providerName && (
                        <Typography variant="caption" color="text.secondary">
                            Provider: {providerName}
                        </Typography>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}

                    {searchResults.length > 0 ? (
                        <Stack spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel>Result</InputLabel>
                                <Select
                                    value={selectedItemId || ''}
                                    label="Result"
                                    onChange={(e) => setSelectedItemId(e.target.value)}
                                >
                                    {searchResults.map((item) => (
                                        <MenuItem key={item.id} value={item.id}>
                                            {item.description}
                                            {item.brand ? ` (${item.brand})` : ''}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth disabled={!selectedItem}>
                                <InputLabel>Measure</InputLabel>
                                <Select
                                    value={selectedMeasure?.label || ''}
                                    label="Measure"
                                    onChange={(e) => setSelectedMeasureLabel(e.target.value)}
                                >
                                    {(selectedItem?.availableMeasures || [])
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
                                disabled={!selectedMeasure}
                                inputProps={{ min: 0, step: 0.5 }}
                            />

                            <Box>
                                <Typography variant="body2" color="text.secondary">
                                    {selectedItem?.nutrientsPer100g
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
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            No results yet. Search by name to see items from the active provider.
                        </Typography>
                    )}
                </Stack>
            )}

            <FormControl fullWidth>
                <InputLabel>Meal Period</InputLabel>
                <Select value={mealPeriod} label="Meal Period" onChange={(e) => setMealPeriod(e.target.value)}>
                    {mealOptions.map((meal) => (
                        <MenuItem key={meal.value} value={meal.value}>
                            <ListItemIcon sx={{ minWidth: 32 }}>{meal.icon}</ListItemIcon>
                            {meal.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {mode === 'manual' ? (
                <Button
                    variant="contained"
                    onClick={() => void handleAddManual()}
                    disabled={!foodName || !calories}
                >
                    Add Food
                </Button>
            ) : (
                <Button
                    variant="contained"
                    onClick={() => void handleAddFromSearch()}
                    disabled={!selectedItem || !computed}
                >
                    Add Selected Food
                </Button>
            )}
        </Stack>
    );
};

export default FoodEntryForm;
