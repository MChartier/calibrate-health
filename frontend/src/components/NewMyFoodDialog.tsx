import React, { useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField
} from '@mui/material';
import axios from 'axios';
import type { MealPeriod } from '../types/mealPeriod';
import type { MyFood } from '../types/myFoods';
import { getApiErrorMessage } from '../utils/apiError';

/**
 * Dialog for creating a new My Food entry (name, serving size, calories).
 */
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

type Props = {
    open: boolean;
    date?: string;
    mealPeriod: MealPeriod;
    onClose: () => void;
    /**
     * Fired after a successful save (and optional log) so callers can refresh My Foods lists.
     */
    onSaved?: (created: MyFood) => void;
    /**
     * Fired after "Save & Log" completes so callers can refresh logs / close parent dialogs.
     */
    onLogged?: () => void;
};

const NewMyFoodDialog: React.FC<Props> = ({ open, date, mealPeriod, onClose, onSaved, onLogged }) => {
    const [name, setName] = useState('');
    const [servingSizeQuantity, setServingSizeQuantity] = useState('1');
    const [servingUnitLabel, setServingUnitLabel] = useState('serving');
    const [caloriesPerServing, setCaloriesPerServing] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canSubmit = useMemo(() => {
        if (!name.trim()) return false;
        const qty = Number(servingSizeQuantity);
        if (!Number.isFinite(qty) || qty <= 0) return false;
        if (!servingUnitLabel.trim()) return false;
        const calories = Number(caloriesPerServing);
        if (!Number.isFinite(calories) || calories < 0) return false;
        return true;
    }, [caloriesPerServing, name, servingSizeQuantity, servingUnitLabel]);

    const handleClose = () => {
        if (isSubmitting) return;
        setError(null);
        onClose();
    };

    const createMyFood = async (): Promise<MyFood> => {
        const res = await axios.post('/api/my-foods/foods', {
            name: name.trim(),
            serving_size_quantity: Number(servingSizeQuantity),
            serving_unit_label: servingUnitLabel.trim(),
            calories_per_serving: Number(caloriesPerServing)
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
        if (!canSubmit) return;
        setIsSubmitting(true);
        setError(null);

        try {
            const created = await createMyFood();
            onSaved?.(created);

            if (opts.logAfterSave) {
                await logMyFood(created.id);
                onLogged?.();
            }

            // Reset fields after successful creation so subsequent entries start fresh.
            setName('');
            setServingSizeQuantity('1');
            setServingUnitLabel('serving');
            setCaloriesPerServing('');
            onClose();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to save this food right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
            <DialogTitle>New Food</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        autoFocus
                        disabled={isSubmitting}
                        required
                    />

                    <Stack direction="row" spacing={1}>
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
                            onChange={(_, next) => {
                                setServingUnitLabel(typeof next === 'string' ? next : '');
                            }}
                            onInputChange={(_, next) => setServingUnitLabel(next)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Unit"
                                    fullWidth
                                    disabled={isSubmitting}
                                    required
                                />
                            )}
                        />
                    </Stack>

                    <TextField
                        label="Calories per serving"
                        type="number"
                        value={caloriesPerServing}
                        onChange={(e) => setCaloriesPerServing(e.target.value)}
                        inputProps={{ min: 0, step: 1 }}
                        fullWidth
                        disabled={isSubmitting}
                        required
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    variant="outlined"
                    onClick={() => void handleSave({ logAfterSave: false })}
                    disabled={!canSubmit || isSubmitting}
                >
                    Save
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void handleSave({ logAfterSave: true })}
                    disabled={!canSubmit || isSubmitting}
                >
                    Save &amp; Log
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default NewMyFoodDialog;
