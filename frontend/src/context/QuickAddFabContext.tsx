import React, { useMemo, useState } from 'react';
import { useQuickAddDialogs } from '../hooks/useQuickAddDialogs';
import { QuickAddFabContext, type QuickAddFabContextValue } from './quickAddFabState';

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
