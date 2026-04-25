import React, { useCallback, useMemo, useState } from 'react';
import { useQuickAddDialogs } from '../hooks/useQuickAddDialogs';
import {
    QuickAddFabContext,
    type LogDateNavigationState,
    type QuickAddFabContextValue,
    type WeightDialogDateMode
} from './quickAddFabState';
import type { MealPeriod } from '../types/mealPeriod';

/**
 * QuickAddFabProvider
 *
 * Holds shared quick-add dialog state plus log-date navigation/override state for `/log`.
 */
export const QuickAddFabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const dialogs = useQuickAddDialogs();
    const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
    const [logDateNavigation, setLogDateNavigation] = useState<LogDateNavigationState | null>(null);
    const [foodDialogMealPeriod, setFoodDialogMealPeriod] = useState<MealPeriod | null>(null);
    const [weightDialogDateMode, setWeightDialogDateMode] = useState<WeightDialogDateMode>('today');

    const openFoodDialogForMeal = useCallback(
        (mealPeriod: MealPeriod | null = null) => {
            setFoodDialogMealPeriod(mealPeriod);
            dialogs.openFoodDialog();
        },
        [dialogs]
    );

    const openWeightDialogFromFab = useCallback(() => {
        setWeightDialogDateMode('today');
        dialogs.openWeightDialog();
    }, [dialogs]);

    const openWeightDialogForLogDate = useCallback(() => {
        setWeightDialogDateMode('logDate');
        dialogs.openWeightDialog();
    }, [dialogs]);

    const value: QuickAddFabContextValue = useMemo(
        () => ({
            dialogs,
            logDateOverride,
            setLogDateOverride,
            logDateNavigation,
            setLogDateNavigation,
            foodDialogMealPeriod,
            weightDialogDateMode,
            openFoodDialogForMeal,
            openWeightDialogFromFab,
            openWeightDialogForLogDate
        }),
        [
            dialogs,
            foodDialogMealPeriod,
            logDateOverride,
            logDateNavigation,
            openFoodDialogForMeal,
            openWeightDialogForLogDate,
            openWeightDialogFromFab,
            setLogDateOverride,
            setLogDateNavigation,
            weightDialogDateMode
        ]
    );

    return <QuickAddFabContext.Provider value={value}>{children}</QuickAddFabContext.Provider>;
};
