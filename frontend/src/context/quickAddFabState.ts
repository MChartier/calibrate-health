import { createContext } from 'react';
import type { QuickAddDialogs } from '../hooks/useQuickAddDialogs';

export type QuickAddFabContextValue = {
    dialogs: QuickAddDialogs;
    logDateOverride: string | null;
    setLogDateOverride: (date: string | null) => void;
};

export const QuickAddFabContext = createContext<QuickAddFabContextValue | undefined>(undefined);
