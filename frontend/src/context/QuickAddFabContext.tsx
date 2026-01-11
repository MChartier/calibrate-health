import React, { useCallback, useMemo, useState } from 'react';
import { useQuickAddDialogs } from '../hooks/useQuickAddDialogs';
import {
    QuickAddFabContext,
    type QuickAddFabContextValue,
    type WeightDialogDateMode
} from './quickAddFabState';

/**
 * QuickAddFabProvider
 *
 * Holds the shared quick-add dialog state and optional log-date override for the floating FAB.
 */
export const QuickAddFabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const dialogs = useQuickAddDialogs();
    const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
    const [weightDialogDateMode, setWeightDialogDateMode] = useState<WeightDialogDateMode>('today');

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
            weightDialogDateMode,
            openWeightDialogFromFab,
            openWeightDialogForLogDate
        }),
        [
            dialogs,
            logDateOverride,
            openWeightDialogForLogDate,
            openWeightDialogFromFab,
            setLogDateOverride,
            weightDialogDateMode
        ]
    );

    return <QuickAddFabContext.Provider value={value}>{children}</QuickAddFabContext.Provider>;
};
