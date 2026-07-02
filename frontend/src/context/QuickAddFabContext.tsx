import React, { useCallback, useMemo, useState } from 'react';
import { useQuickAddDialogs } from '../hooks/useQuickAddDialogs';
import {
    QuickAddFabContext,
    type LogDateNavigationState,
    type QuickAddFabContextValue,
    type WeightDialogDateMode
} from './quickAddFabState';

/**
 * QuickAddFabProvider
 *
 * Holds shared quick-add dialog state plus log-date navigation/override state for `/log`.
 */
export const QuickAddFabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const dialogs = useQuickAddDialogs();
    const [logDateOverride, setLogDateOverride] = useState<string | null>(null);
    const [logDateNavigation, setLogDateNavigation] = useState<LogDateNavigationState | null>(null);
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
            logDateNavigation,
            setLogDateNavigation,
            weightDialogDateMode,
            openWeightDialogFromFab,
            openWeightDialogForLogDate
        }),
        [
            dialogs,
            logDateOverride,
            logDateNavigation,
            openWeightDialogForLogDate,
            openWeightDialogFromFab,
            setLogDateOverride,
            setLogDateNavigation,
            weightDialogDateMode
        ]
    );

    return <QuickAddFabContext.Provider value={value}>{children}</QuickAddFabContext.Provider>;
};
