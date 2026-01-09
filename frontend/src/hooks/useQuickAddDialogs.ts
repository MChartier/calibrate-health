import { useCallback, useMemo, useState } from 'react';

export type QuickAddDialogs = {
    isFoodDialogOpen: boolean;
    isWeightDialogOpen: boolean;
    openFoodDialog: () => void;
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

    const openFoodDialog = useCallback(() => setIsFoodDialogOpen(true), []);
    const closeFoodDialog = useCallback(() => setIsFoodDialogOpen(false), []);
    const openWeightDialog = useCallback(() => setIsWeightDialogOpen(true), []);
    const closeWeightDialog = useCallback(() => setIsWeightDialogOpen(false), []);

    return useMemo(
        () => ({
            isFoodDialogOpen,
            isWeightDialogOpen,
            openFoodDialog,
            closeFoodDialog,
            openWeightDialog,
            closeWeightDialog
        }),
        [closeFoodDialog, closeWeightDialog, isFoodDialogOpen, isWeightDialogOpen, openFoodDialog, openWeightDialog]
    );
}
