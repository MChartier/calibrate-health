import { useContext } from 'react';
import { QuickAddFabContext, type QuickAddFabContextValue } from './quickAddFabState';

/**
 * Access the shared quick-add FAB controls plus `/log` date navigation state.
 */
export function useQuickAddFab(): QuickAddFabContextValue {
    const context = useContext(QuickAddFabContext);
    if (!context) {
        throw new Error('useQuickAddFab must be used within a QuickAddFabProvider');
    }
    return context;
}
