import React, { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getMealPeriodLabel, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';
import { useI18n } from '../i18n/useI18n';
import { haptic } from '../utils/haptics';
import FoodLogMealRow, { type FoodLogMealEntry } from './FoodLogMealRow';

/**
 * Food log UI grouped by meal period with meal-level add actions plus edit/delete controls.
 */
type FoodLogEntry = FoodLogMealEntry & {
    meal_period?: MealPeriod;
};

const MEAL_PERIOD_SET = new Set<MealPeriod>(MEAL_PERIOD_ORDER);

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

/**
 * Parse a servings input into a positive number, returning null when invalid.
 */
function parseServingsInput(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

export type FoodLogMealsProps = {
    logs: FoodLogEntry[];
    /**
     * When true, render shaped skeleton placeholders in place of dynamic totals/entries.
     */
    isLoading?: boolean;
    /**
     * Opens the shared add-food dialog with the selected meal prefilled.
     */
    onAddMeal: (mealPeriod: MealPeriod) => void;
};

/**
 * FoodLogMeals renders the day log as a timeline grouped by meal and supports inline edits/deletes.
 */
const FoodLogMeals: React.FC<FoodLogMealsProps> = ({ logs, isLoading = false, onAddMeal }) => {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const meals = useMemo(() => {
        return MEAL_PERIOD_ORDER.map((key) => ({
            key,
            label: getMealPeriodLabel(key, t)
        }));
    }, [t]);

    const grouped = useMemo(() => {
        const groups = createMealPeriodRecord<FoodLogEntry[]>(() => []);

        for (const log of Array.isArray(logs) ? logs : []) {
            const meal = normalizeMealPeriod(log.meal_period);
            if (!meal) continue;
            groups[meal].push(log);
        }

        return groups;
    }, [logs]);

    const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
    const [editName, setEditName] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editMealPeriod, setEditMealPeriod] = useState<MealPeriod>('BREAKFAST');
    const [editServingsConsumed, setEditServingsConsumed] = useState('');
    const [editOriginalCalories, setEditOriginalCalories] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [expandedMeals, setExpandedMeals] = useState(() => createMealPeriodRecord(() => true));

    const [deleteEntry, setDeleteEntry] = useState<FoodLogEntry | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const updateMutation = useMutation({
        mutationFn: async (vars: {
            id: number | string;
            data: { name: string; calories?: number; meal_period: MealPeriod; servings_consumed?: number };
        }) => {
            const res = await axios.patch(`/api/food/${encodeURIComponent(String(vars.id))}`, vars.data);
            return res.data;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['food'] });
            await queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number | string) => {
            await axios.delete(`/api/food/${encodeURIComponent(String(id))}`);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['food'] });
            await queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
        }
    });

    const handleToggleMeal = useCallback((mealPeriod: MealPeriod) => {
        setExpandedMeals((current) => ({
            ...current,
            [mealPeriod]: !current[mealPeriod]
        }));
    }, []);

    const handleOpenEdit = (entry: FoodLogEntry) => {
        setEditEntry(entry);
        setEditName(typeof entry.name === 'string' ? entry.name : '');
        setEditCalories(typeof entry.calories === 'number' ? String(entry.calories) : '');
        setEditOriginalCalories(typeof entry.calories === 'number' ? String(entry.calories) : '');
        setEditMealPeriod(normalizeMealPeriod(entry.meal_period) ?? 'BREAKFAST');
        setEditServingsConsumed(
            typeof entry.servings_consumed === 'number' && Number.isFinite(entry.servings_consumed)
                ? String(entry.servings_consumed)
                : ''
        );
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
            setEditError(t('foodLog.validation.nameRequired'));
            return;
        }

        const parsedCalories = parseCaloriesInput(editCalories);
        if (parsedCalories === null) {
            setEditError(t('foodLog.validation.caloriesNonNegative'));
            return;
        }

        const hasServingSnapshot = Boolean(editEntry.serving_unit_label_snapshot);
        const servingsValueRaw = editServingsConsumed.trim();
        const servingsValue = servingsValueRaw ? parseServingsInput(servingsValueRaw) : null;
        if (hasServingSnapshot && servingsValueRaw && servingsValue === null) {
            setEditError(t('foodLog.validation.servingsPositive'));
            return;
        }

        try {
            const caloriesChanged = editCalories.trim() !== editOriginalCalories;
            const shouldSendCalories = !hasServingSnapshot || caloriesChanged || servingsValue === null;
            await updateMutation.mutateAsync({
                id: editEntry.id,
                data: {
                    name: trimmedName,
                    meal_period: editMealPeriod,
                    ...(shouldSendCalories ? { calories: parsedCalories } : {}),
                    ...(servingsValue !== null ? { servings_consumed: servingsValue } : {})
                }
            });
            haptic.success();
            setEditEntry(null);
        } catch (err) {
            console.error(err);
            haptic.error();
            setEditError(t('foodLog.error.saveFailed'));
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
            haptic.warning();
            setDeleteEntry(null);
        } catch (err) {
            console.error(err);
            haptic.error();
            setDeleteError(t('foodLog.error.deleteFailed'));
        }
    };

    return (
        <>
            <Stack sx={{ mt: 0.5 }}>
                {meals.map((meal, index) => {
                    const entries = grouped[meal.key];
                    return (
                        <FoodLogMealRow
                            key={meal.key}
                            mealPeriod={meal.key}
                            label={meal.label}
                            entries={entries}
                            totalCalories={sumCalories(entries)}
                            isLoading={isLoading}
                            isFirst={index === 0}
                            isLast={index === meals.length - 1}
                            onAdd={onAddMeal}
                            onEdit={handleOpenEdit}
                            onDelete={handleOpenDelete}
                            isExpanded={expandedMeals[meal.key]}
                            onToggleExpanded={handleToggleMeal}
                        />
                    );
                })}
            </Stack>

            <Dialog open={!!editEntry} onClose={handleCloseEdit} fullWidth maxWidth="xs">
                <DialogTitle>{t('foodLog.editDialog.title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {editError && <Alert severity="error">{editError}</Alert>}
                        <TextField
                            label={t('foodLog.field.name')}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            fullWidth
                            autoFocus
                        />
                        <TextField
                            label={t('foodLog.field.calories')}
                            type="number"
                            value={editCalories}
                            onChange={(e) => setEditCalories(e.target.value)}
                            fullWidth
                            slotProps={{
                                htmlInput: { min: 0, step: 1 }
                            }}
                        />
                        {editEntry?.serving_unit_label_snapshot && (
                            <TextField
                                label={t('foodLog.field.servingsConsumed', { unit: editEntry.serving_unit_label_snapshot })}
                                type="number"
                                value={editServingsConsumed}
                                onChange={(e) => setEditServingsConsumed(e.target.value)}
                                fullWidth
                                slotProps={{
                                    htmlInput: { min: 0, step: 0.1 }
                                }}
                            />
                        )}
                        <FormControl fullWidth>
                            <InputLabel id="food-log-meal-period-label">{t('foodLog.field.meal')}</InputLabel>
                            <Select
                                labelId="food-log-meal-period-label"
                                label={t('foodLog.field.meal')}
                                value={editMealPeriod}
                                onChange={(e) => setEditMealPeriod(e.target.value as MealPeriod)}
                            >
                                {meals.map((meal) => (
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
                        {t('common.cancel')}
                    </Button>
                    <Button variant="contained" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteEntry} onClose={handleCloseDelete} fullWidth maxWidth="xs">
                <DialogTitle>{t('foodLog.deleteDialog.title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {deleteError && <Alert severity="error">{deleteError}</Alert>}
                        <Typography>
                            {deleteEntry?.name
                                ? t('foodLog.deleteDialog.confirmNamed', { name: deleteEntry.name })
                                : t('foodLog.deleteDialog.confirmGeneric')}
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDelete} disabled={deleteMutation.isPending}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleConfirmDelete}
                        disabled={deleteMutation.isPending}
                    >
                        {t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default FoodLogMeals;
