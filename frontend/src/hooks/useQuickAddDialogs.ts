import { useCallback, useMemo, useState } from 'react';
import type { MealPeriod } from '../types/mealPeriod';

export type QuickAddDialogs = {
    isFoodDialogOpen: boolean;
    isWeightDialogOpen: boolean;
    foodDialogMealPeriod: MealPeriod | null;
    openFoodDialog: (mealPeriod?: MealPeriod | null) => void;
    closeFoodDialog: () => void;
    openWeightDialog: () => void;
    closeWeightDialog: () => void;
};

/**
 * useQuickAddDialogs
 *
 * Centralize quick-add dialog state so multiple screens can share the same open/close wiring.
 */
export function useQuickAddDialogs(): QuickAddDialogs {
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
    const [foodDialogMealPeriod, setFoodDialogMealPeriod] = useState<MealPeriod | null>(null);

    const openFoodDialog = useCallback((mealPeriod?: MealPeriod | null) => {
        setFoodDialogMealPeriod(mealPeriod ?? null);
        setIsFoodDialogOpen(true);
    }, []);
    const closeFoodDialog = useCallback(() => {
        setIsFoodDialogOpen(false);
        setFoodDialogMealPeriod(null);
    }, []);
    const openWeightDialog = useCallback(() => setIsWeightDialogOpen(true), []);
    const closeWeightDialog = useCallback(() => setIsWeightDialogOpen(false), []);

    return useMemo(
        () => ({
            isFoodDialogOpen,
            isWeightDialogOpen,
            foodDialogMealPeriod,
            openFoodDialog,
            closeFoodDialog,
            openWeightDialog,
            closeWeightDialog
        }),
        [
            closeFoodDialog,
            closeWeightDialog,
            foodDialogMealPeriod,
            isFoodDialogOpen,
            isWeightDialogOpen,
            openFoodDialog,
            openWeightDialog
        ]
    );
}
