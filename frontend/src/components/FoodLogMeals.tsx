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
import { alpha, useTheme } from '@mui/material/styles';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { getMealPeriodAccentColor } from '../utils/mealColors';
import SectionHeader from '../ui/SectionHeader';

type FoodLogEntry = {
    id: number | string;
    meal_period?: MealPeriod;
    name?: string;
    calories?: number;
};

const MEALS: Array<{ key: MealPeriod; label: string }> = MEAL_PERIOD_ORDER.map((key) => ({
    key,
    label: MEAL_PERIOD_LABELS[key]
}));

const MEAL_PERIOD_SET = new Set<MealPeriod>(MEAL_PERIOD_ORDER);

/**
 * Return a validated meal period (or null) so the UI can safely group entries.
 */
function normalizeMealPeriod(value: unknown): MealPeriod | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim() as MealPeriod;
    return MEAL_PERIOD_SET.has(trimmed) ? trimmed : null;
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
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;

    const mealIcons = useMemo<Record<MealPeriod, React.ReactNode>>(
        () => ({
            BREAKFAST: <EggAltIcon sx={{ color: getMealPeriodAccentColor(theme, 'BREAKFAST') }} />,
            MORNING_SNACK: <BakeryDiningIcon sx={{ color: getMealPeriodAccentColor(theme, 'MORNING_SNACK') }} />,
            LUNCH: <LunchDiningIcon sx={{ color: getMealPeriodAccentColor(theme, 'LUNCH') }} />,
            AFTERNOON_SNACK: <IcecreamIcon sx={{ color: getMealPeriodAccentColor(theme, 'AFTERNOON_SNACK') }} />,
            DINNER: <DinnerDiningIcon sx={{ color: getMealPeriodAccentColor(theme, 'DINNER') }} />,
            EVENING_SNACK: <NightlifeIcon sx={{ color: getMealPeriodAccentColor(theme, 'EVENING_SNACK') }} />
        }),
        [theme]
    );

    const grouped = useMemo(() => {
        const groups: Record<MealPeriod, FoodLogEntry[]> = {
            BREAKFAST: [],
            MORNING_SNACK: [],
            LUNCH: [],
            AFTERNOON_SNACK: [],
            DINNER: [],
            EVENING_SNACK: []
        };

        for (const log of Array.isArray(logs) ? logs : []) {
            const meal = normalizeMealPeriod(log.meal_period);
            if (!meal) continue;
            groups[meal].push(log);
        }

        return groups;
    }, [logs]);

    const [expanded, setExpanded] = useState<Record<MealPeriod, boolean>>({
        BREAKFAST: true,
        MORNING_SNACK: true,
        LUNCH: true,
        AFTERNOON_SNACK: true,
        DINNER: true,
        EVENING_SNACK: true
    });

    const previousCountsRef = useRef<Record<MealPeriod, number> | null>(null);

    useEffect(() => {
        const counts: Record<MealPeriod, number> = {
            BREAKFAST: grouped.BREAKFAST.length,
            MORNING_SNACK: grouped.MORNING_SNACK.length,
            LUNCH: grouped.LUNCH.length,
            AFTERNOON_SNACK: grouped.AFTERNOON_SNACK.length,
            DINNER: grouped.DINNER.length,
            EVENING_SNACK: grouped.EVENING_SNACK.length
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
            BREAKFAST: true,
            MORNING_SNACK: true,
            LUNCH: true,
            AFTERNOON_SNACK: true,
            DINNER: true,
            EVENING_SNACK: true
        });
    };

    const handleCollapseAll = () => {
        setExpanded({
            BREAKFAST: false,
            MORNING_SNACK: false,
            LUNCH: false,
            AFTERNOON_SNACK: false,
            DINNER: false,
            EVENING_SNACK: false
        });
    };

    const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
    const [editName, setEditName] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editMealPeriod, setEditMealPeriod] = useState<MealPeriod>('BREAKFAST');
    const [editError, setEditError] = useState<string | null>(null);

    const [deleteEntry, setDeleteEntry] = useState<FoodLogEntry | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const updateMutation = useMutation({
        mutationFn: async (vars: { id: number | string; data: { name: string; calories: number; meal_period: MealPeriod } }) => {
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
        setEditMealPeriod(normalizeMealPeriod(entry.meal_period) ?? 'BREAKFAST');
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
        <Stack spacing={sectionGap} useFlexGap>
            <SectionHeader
                title="Food Log"
                align="center"
                actions={
                    <>
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
                    </>
                }
            />
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
                                <Avatar
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        bgcolor: alpha(getMealPeriodAccentColor(theme, meal.key), theme.palette.mode === 'dark' ? 0.16 : 0.1),
                                        border: (t) => `1px solid ${t.palette.divider}`
                                    }}
                                    variant="rounded"
                                >
                                    {mealIcons[meal.key]}
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
                                onChange={(e) => setEditMealPeriod(e.target.value as MealPeriod)}
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
