import { createContext } from 'react';
import type { QuickAddDialogs } from '../hooks/useQuickAddDialogs';

export type WeightDialogDateMode = 'today' | 'logDate';

export type QuickAddFabContextValue = {
    dialogs: QuickAddDialogs;
    logDateOverride: string | null;
    setLogDateOverride: (date: string | null) => void;
    weightDialogDateMode: WeightDialogDateMode;
    openWeightDialogFromFab: () => void;
    openWeightDialogForLogDate: () => void;
};

export const QuickAddFabContext = createContext<QuickAddFabContextValue | undefined>(undefined);
