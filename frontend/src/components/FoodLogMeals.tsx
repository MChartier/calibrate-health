import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Avatar,
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
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EggAltIcon from '@mui/icons-material/EggAlt';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import IcecreamIcon from '@mui/icons-material/Icecream';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import NightlifeIcon from '@mui/icons-material/Nightlife';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type MealKey =
    | 'Breakfast'
    | 'Morning Snack'
    | 'Lunch'
    | 'Afternoon Snack'
    | 'Dinner'
    | 'Evening Snack';

type FoodLogEntry = {
    id: number | string;
    meal_period?: string;
    name?: string;
    calories?: number;
};

const MEALS: Array<{ key: MealKey; label: string; aliases: string[]; icon: React.ReactNode }> = [
    { key: 'Breakfast', label: 'Breakfast', aliases: ['Breakfast'], icon: <EggAltIcon htmlColor="#ff9800" /> },
    { key: 'Morning Snack', label: 'Morning Snack', aliases: ['Morning Snack', 'Morning'], icon: <BakeryDiningIcon htmlColor="#4caf50" /> },
    { key: 'Lunch', label: 'Lunch', aliases: ['Lunch'], icon: <LunchDiningIcon htmlColor="#3f51b5" /> },
    { key: 'Afternoon Snack', label: 'Afternoon Snack', aliases: ['Afternoon Snack', 'Afternoon'], icon: <IcecreamIcon htmlColor="#8bc34a" /> },
    { key: 'Dinner', label: 'Dinner', aliases: ['Dinner'], icon: <DinnerDiningIcon htmlColor="#9c27b0" /> },
    { key: 'Evening Snack', label: 'Evening Snack', aliases: ['Evening Snack', 'Evening'], icon: <NightlifeIcon htmlColor="#e91e63" /> }
];

function normalizeMealPeriod(value: unknown): MealKey | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    for (const meal of MEALS) {
        if (meal.aliases.includes(trimmed)) {
            return meal.key;
        }
    }
    return null;
}

function sumCalories(entries: FoodLogEntry[]): number {
    return entries.reduce((total, entry) => total + (typeof entry.calories === 'number' ? entry.calories : 0), 0);
}

/**
 * Parse a calories input into a non-negative integer, returning null when invalid.
 */
function parseCaloriesInput(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.trunc(parsed);
    if (rounded < 0) return null;
    return rounded;
}

const FoodLogMeals: React.FC<{ logs: FoodLogEntry[] }> = ({ logs }) => {
    const queryClient = useQueryClient();

    const grouped = useMemo(() => {
        const groups: Record<MealKey, FoodLogEntry[]> = {
            Breakfast: [],
            'Morning Snack': [],
            Lunch: [],
            'Afternoon Snack': [],
            Dinner: [],
            'Evening Snack': []
        };

        for (const log of Array.isArray(logs) ? logs : []) {
            const meal = normalizeMealPeriod(log.meal_period);
            if (!meal) continue;
            groups[meal].push(log);
        }

        return groups;
    }, [logs]);

    const [expanded, setExpanded] = useState<Record<MealKey, boolean>>({
        Breakfast: true,
        'Morning Snack': true,
        Lunch: true,
        'Afternoon Snack': true,
        Dinner: true,
        'Evening Snack': true
    });

    const previousCountsRef = useRef<Record<MealKey, number> | null>(null);

    useEffect(() => {
        const counts: Record<MealKey, number> = {
            Breakfast: grouped.Breakfast.length,
            'Morning Snack': grouped['Morning Snack'].length,
            Lunch: grouped.Lunch.length,
            'Afternoon Snack': grouped['Afternoon Snack'].length,
            Dinner: grouped.Dinner.length,
            'Evening Snack': grouped['Evening Snack'].length
        };

        const previousCounts = previousCountsRef.current;
        previousCountsRef.current = counts;
        if (!previousCounts) return;

        setExpanded((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const meal of MEALS) {
                const key = meal.key;
                if (previousCounts[key] === 0 && counts[key] > 0) {
                    next[key] = true;
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [grouped]);

    const handleExpandAll = () => {
        setExpanded({
            Breakfast: true,
            'Morning Snack': true,
            Lunch: true,
            'Afternoon Snack': true,
            Dinner: true,
            'Evening Snack': true
        });
    };

    const handleCollapseAll = () => {
        setExpanded({
            Breakfast: false,
            'Morning Snack': false,
            Lunch: false,
            'Afternoon Snack': false,
            Dinner: false,
            'Evening Snack': false
        });
    };

    const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
    const [editName, setEditName] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editMealPeriod, setEditMealPeriod] = useState<MealKey>('Breakfast');
    const [editError, setEditError] = useState<string | null>(null);

    const [deleteEntry, setDeleteEntry] = useState<FoodLogEntry | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const updateMutation = useMutation({
        mutationFn: async (vars: { id: number | string; data: { name: string; calories: number; meal_period: MealKey } }) => {
            const res = await axios.patch(`/api/food/${encodeURIComponent(String(vars.id))}`, vars.data);
            return res.data;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['food'] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number | string) => {
            await axios.delete(`/api/food/${encodeURIComponent(String(id))}`);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['food'] });
        }
    });

    const handleOpenEdit = (entry: FoodLogEntry) => {
        setEditEntry(entry);
        setEditName(typeof entry.name === 'string' ? entry.name : '');
        setEditCalories(typeof entry.calories === 'number' ? String(entry.calories) : '');
        setEditMealPeriod(normalizeMealPeriod(entry.meal_period) ?? 'Breakfast');
        setEditError(null);
    };

    const handleCloseEdit = () => {
        if (updateMutation.isPending) return;
        setEditEntry(null);
        setEditError(null);
    };

    const handleSaveEdit = async () => {
        if (!editEntry) return;
        setEditError(null);

        const trimmedName = editName.trim();
        if (!trimmedName) {
            setEditError('Name is required.');
            return;
        }

        const parsedCalories = parseCaloriesInput(editCalories);
        if (parsedCalories === null) {
            setEditError('Calories must be a non-negative number.');
            return;
        }

        try {
            await updateMutation.mutateAsync({
                id: editEntry.id,
                data: { name: trimmedName, calories: parsedCalories, meal_period: editMealPeriod }
            });
            setEditEntry(null);
        } catch (err) {
            console.error(err);
            setEditError('Unable to save changes right now.');
        }
    };

    const handleOpenDelete = (entry: FoodLogEntry) => {
        setDeleteEntry(entry);
        setDeleteError(null);
    };

    const handleCloseDelete = () => {
        if (deleteMutation.isPending) return;
        setDeleteEntry(null);
        setDeleteError(null);
    };

    const handleConfirmDelete = async () => {
        if (!deleteEntry) return;
        setDeleteError(null);
        try {
            await deleteMutation.mutateAsync(deleteEntry.id);
            setDeleteEntry(null);
        } catch (err) {
            console.error(err);
            setDeleteError('Unable to delete this entry right now.');
        }
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Food Log</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Collapse all">
                        <IconButton size="small" onClick={handleCollapseAll}>
                            <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Expand all">
                        <IconButton size="small" onClick={handleExpandAll}>
                            <ExpandMoreIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            {MEALS.map((meal) => {
                const entries = grouped[meal.key];
                const total = sumCalories(entries);
                const isExpanded = expanded[meal.key];

                return (
                    <Accordion
                        key={meal.key}
                        expanded={isExpanded}
                        onChange={(_, nextExpanded) => setExpanded((prev) => ({ ...prev, [meal.key]: nextExpanded }))}
                        variant="outlined"
                        disableGutters
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
                                <Avatar sx={{ width: 28, height: 28, bgcolor: 'background.default' }} variant="rounded">
                                    {meal.icon}
                                </Avatar>
                                <Typography sx={{ fontWeight: 'bold' }}>{meal.label}</Typography>
                            </Box>
                            <Typography color="text.secondary">{total} Calories</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            {entries.length === 0 ? (
                                <Typography color="text.secondary">No entries yet.</Typography>
                            ) : (
                                <Stack divider={<Divider flexItem />} spacing={1}>
                                    {entries.map((entry) => (
                                        <Box
                                            key={entry.id}
                                            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                                        >
                                            <Typography sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                                {entry.name}
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Typography color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                    {entry.calories} Calories
                                                </Typography>
                                                <Tooltip title="Edit entry">
                                                    <IconButton size="small" onClick={() => handleOpenEdit(entry)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete entry">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleOpenDelete(entry)}
                                                        sx={{ color: (theme) => theme.palette.error.main }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            <Dialog open={!!editEntry} onClose={handleCloseEdit} fullWidth maxWidth="xs">
                <DialogTitle>Edit food entry</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {editError && <Alert severity="error">{editError}</Alert>}
                        <TextField
                            label="Name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            fullWidth
                            autoFocus
                        />
                        <TextField
                            label="Calories"
                            type="number"
                            value={editCalories}
                            onChange={(e) => setEditCalories(e.target.value)}
                            inputProps={{ min: 0, step: 1 }}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel id="food-log-meal-period-label">Meal</InputLabel>
                            <Select
                                labelId="food-log-meal-period-label"
                                label="Meal"
                                value={editMealPeriod}
                                onChange={(e) => setEditMealPeriod(e.target.value as MealKey)}
                            >
                                {MEALS.map((meal) => (
                                    <MenuItem key={meal.key} value={meal.key}>
                                        {meal.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseEdit} disabled={updateMutation.isPending}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteEntry} onClose={handleCloseDelete} fullWidth maxWidth="xs">
                <DialogTitle>Delete food entry?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {deleteError && <Alert severity="error">{deleteError}</Alert>}
                        <Typography>
                            {deleteEntry?.name ? `Delete "${deleteEntry.name}"?` : 'Delete this entry?'}
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDelete} disabled={deleteMutation.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleConfirmDelete}
                        disabled={deleteMutation.isPending}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default FoodLogMeals;
