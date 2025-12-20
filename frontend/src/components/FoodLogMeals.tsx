import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Stack,
    Tooltip,
    Typography,
    Avatar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EggAltIcon from '@mui/icons-material/EggAlt';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import IcecreamIcon from '@mui/icons-material/Icecream';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import NightlifeIcon from '@mui/icons-material/Nightlife';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import axios from 'axios';

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

type DeleteState = { id: number; label: string } | null;

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

const FoodLogMeals: React.FC<{ logs: FoodLogEntry[]; onChange?: () => void }> = ({ logs, onChange }) => {
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
    const [deleteState, setDeleteState] = useState<DeleteState>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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

    /**
     * Delete a single food log entry and refresh the parent list when successful.
     */
    const handleConfirmDelete = async () => {
        if (!deleteState) return;
        setDeleteError(null);
        setIsDeleting(true);
        try {
            await axios.delete(`/api/food/${deleteState.id}`);
            setDeleteState(null);
            onChange?.();
        } catch (err) {
            console.error(err);
            setDeleteError('Unable to delete this entry right now.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Food Log</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Collapse all">
                        <IconButton size="small" aria-label="Collapse all meals" onClick={handleCollapseAll}>
                            <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Expand all">
                        <IconButton size="small" aria-label="Expand all meals" onClick={handleExpandAll}>
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
                                <List dense disablePadding>
                                    {entries.map((entry) => {
                                        const id = typeof entry.id === 'number' ? entry.id : Number(entry.id);
                                        const label = entry.name?.trim() || 'Food entry';

                                        return (
                                            <ListItem
                                                key={entry.id}
                                                disableGutters
                                                secondaryAction={
                                                    <IconButton
                                                        aria-label={`Delete ${label}`}
                                                        edge="end"
                                                        onClick={() => {
                                                            if (!Number.isInteger(id)) return;
                                                            setDeleteError(null);
                                                            setDeleteState({ id, label });
                                                        }}
                                                    >
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                }
                                            >
                                                <ListItemText
                                                    primary={label}
                                                    secondary={`${typeof entry.calories === 'number' ? entry.calories : 0} kcal`}
                                                />
                                            </ListItem>
                                        );
                                    })}
                                </List>
                            )}
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            <Dialog
                open={Boolean(deleteState)}
                onClose={() => {
                    if (isDeleting) return;
                    setDeleteState(null);
                }}
            >
                <DialogTitle>Delete entry?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography>
                            This will remove <strong>{deleteState?.label}</strong> from your log.
                        </Typography>
                        {deleteError && <Alert severity="error">{deleteError}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDeleteState(null)}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => void handleConfirmDelete()}
                        disabled={isDeleting}
                    >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default FoodLogMeals;
