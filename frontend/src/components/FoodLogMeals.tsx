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
    Skeleton,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteIcon from '@mui/icons-material/DeleteRounded';
import { alpha, useTheme } from '@mui/material/styles';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { getMealPeriodAccentColor } from '../utils/mealColors';
import SectionHeader from '../ui/SectionHeader';
import MealPeriodIcon from './MealPeriodIcon';

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

// Number of placeholder entry rows shown per meal while switching dates with no cached food data yet.
const FOOD_LOG_SKELETON_ROW_COUNT = 2;
// Placeholder size knobs for the shaped loading UI.
const FOOD_LOG_SKELETON_TOTAL_WIDTH_PX = 88; // Approx width of the "{N} Calories" summary text.
const FOOD_LOG_SKELETON_TOTAL_HEIGHT_PX = 24; // Keeps the placeholder aligned with Typography metrics.
const FOOD_LOG_SKELETON_ROW_HEIGHT_PX = 22; // Height for each placeholder row in AccordionDetails.
const FOOD_LOG_SKELETON_ROW_CALORIES_WIDTH_PX = 76; // Approx width of a "{N} Calories" entry label.
const FOOD_LOG_SKELETON_ROW_NAME_WIDTH_BASE_PERCENT = 58; // Base width for the entry name skeleton (varied per row).
const FOOD_LOG_SKELETON_ROW_NAME_WIDTH_STEP_PERCENT = 10; // Step size for varying each skeleton row width.

/**
 * Build a Record keyed by MealPeriod using the canonical MEAL_PERIOD_ORDER sequence.
 */
function createMealPeriodRecord<T>(createValue: (mealPeriod: MealPeriod) => T): Record<MealPeriod, T> {
    return MEAL_PERIOD_ORDER.reduce((record, mealPeriod) => {
        record[mealPeriod] = createValue(mealPeriod);
        return record;
    }, {} as Record<MealPeriod, T>);
}

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

export type FoodLogMealsProps = {
    logs: FoodLogEntry[];
    /**
     * When true, render shaped skeleton placeholders in place of dynamic totals/entries.
     *
     * This prevents the UI from flashing misleading empty states (e.g. "No entries yet") while
     * switching dates and waiting for the new day's data to load.
     */
    isLoading?: boolean;
};

const FoodLogMeals: React.FC<FoodLogMealsProps> = ({ logs, isLoading = false }) => {
    const queryClient = useQueryClient();
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;

    const grouped = useMemo(() => {
        const groups = createMealPeriodRecord<FoodLogEntry[]>(() => []);

        for (const log of Array.isArray(logs) ? logs : []) {
            const meal = normalizeMealPeriod(log.meal_period);
            if (!meal) continue;
            groups[meal].push(log);
        }

        return groups;
    }, [logs]);

    const [expanded, setExpanded] = useState<Record<MealPeriod, boolean>>(() => createMealPeriodRecord(() => true));

    const previousCountsRef = useRef<Record<MealPeriod, number> | null>(null);

    useEffect(() => {
        const counts = createMealPeriodRecord((mealPeriod) => grouped[mealPeriod].length);

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
        setExpanded(createMealPeriodRecord(() => true));
    };

    const handleCollapseAll = () => {
        setExpanded(createMealPeriodRecord(() => false));
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
                const accentColor = getMealPeriodAccentColor(theme, meal.key);
                const avatarBg = alpha(accentColor, theme.palette.mode === 'dark' ? 0.16 : 0.1);

                return (
                    <Accordion
                        key={meal.key}
                        expanded={isExpanded}
                        onChange={(_, nextExpanded) => setExpanded((prev) => ({ ...prev, [meal.key]: nextExpanded }))}
                        variant="outlined"
                        disableGutters
                    >
                        <AccordionSummary
                            expandIcon={<ExpandMoreIcon />}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
                                <Avatar
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        bgcolor: avatarBg,
                                        border: (t) => `1px solid ${t.palette.divider}`
                                    }}
                                    variant="rounded"
                                >
                                    <MealPeriodIcon mealPeriod={meal.key} />
                                </Avatar>
                                <Typography sx={{ fontWeight: 'bold' }}>{meal.label}</Typography>
                            </Box>
                            {isLoading ? (
                                <Skeleton width={FOOD_LOG_SKELETON_TOTAL_WIDTH_PX} height={FOOD_LOG_SKELETON_TOTAL_HEIGHT_PX} />
                            ) : (
                                <Typography color="text.secondary">{total} Calories</Typography>
                            )}
                        </AccordionSummary>
                        <AccordionDetails>
                            {isLoading ? (
                                <Stack divider={<Divider flexItem />} spacing={1}>
                                    {Array.from({ length: FOOD_LOG_SKELETON_ROW_COUNT }).map((_, idx) => (
                                        <Box
                                            key={idx}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 1
                                            }}
                                        >
                                            <Skeleton
                                                width={`${FOOD_LOG_SKELETON_ROW_NAME_WIDTH_BASE_PERCENT + idx * FOOD_LOG_SKELETON_ROW_NAME_WIDTH_STEP_PERCENT}%`}
                                                height={FOOD_LOG_SKELETON_ROW_HEIGHT_PX}
                                            />
                                            <Skeleton
                                                width={FOOD_LOG_SKELETON_ROW_CALORIES_WIDTH_PX}
                                                height={FOOD_LOG_SKELETON_ROW_HEIGHT_PX}
                                            />
                                        </Box>
                                    ))}
                                </Stack>
                            ) : entries.length === 0 ? (
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
