import React, { createContext, useMemo, useState } from 'react';
import { useQuickAddDialogs, type QuickAddDialogs } from '../hooks/useQuickAddDialogs';

export type QuickAddFabContextValue = {
    dialogs: QuickAddDialogs;
    logDateOverride: string | null;
    setLogDateOverride: (date: string | null) => void;
};

export const QuickAddFabContext = createContext<QuickAddFabContextValue | undefined>(undefined);

/**
 * QuickAddFabProvider
 *
 * Holds the shared quick-add dialog state and optional log-date override for the floating FAB.
 */
export const QuickAddFabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const dialogs = useQuickAddDialogs();
    const [logDateOverride, setLogDateOverride] = useState<string | null>(null);

    const value: QuickAddFabContextValue = useMemo(
        () => ({
            dialogs,
            logDateOverride,
            setLogDateOverride
        }),
        [dialogs, logDateOverride, setLogDateOverride]
    );

    return <QuickAddFabContext.Provider value={value}>{children}</QuickAddFabContext.Provider>;
};
