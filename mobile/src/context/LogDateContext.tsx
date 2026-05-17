import React, { createContext, useContext } from 'react';
import type { LogDateNavigation } from '../hooks/useLogDateNavigation';

const LogDateContext = createContext<LogDateNavigation | null>(null);

/**
 * Shares the selected log day between the app bar date controls and the visible Log tab.
 */
export const LogDateProvider: React.FC<{ value: LogDateNavigation; children: React.ReactNode }> = ({ value, children }) => (
    <LogDateContext.Provider value={value}>{children}</LogDateContext.Provider>
);

export function useSharedLogDateNavigation(): LogDateNavigation {
    const value = useContext(LogDateContext);
    if (!value) {
        throw new Error('useSharedLogDateNavigation must be used inside LogDateProvider');
    }
    return value;
}
