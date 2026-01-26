import { createContext } from 'react';
import type { QuickAddDialogs } from '../hooks/useQuickAddDialogs';

export type WeightDialogDateMode = 'today' | 'logDate';

/**
 * Shared log-date navigation state used by the navbar date controls on `/log`.
 */
export type LogDateNavigationState = {
    date: string;
    dateLabel: string;
    minDate: string;
    maxDate: string;
    canGoBack: boolean;
    canGoForward: boolean;
    goToPreviousDate: () => void;
    goToNextDate: () => void;
    goToToday: () => void;
    setDate: (nextDate: string) => void;
};

export type QuickAddFabContextValue = {
    dialogs: QuickAddDialogs;
    logDateOverride: string | null;
    setLogDateOverride: (date: string | null) => void;
    logDateNavigation: LogDateNavigationState | null;
    setLogDateNavigation: (state: LogDateNavigationState | null) => void;
    weightDialogDateMode: WeightDialogDateMode;
    openWeightDialogFromFab: () => void;
    openWeightDialogForLogDate: () => void;
};

export const QuickAddFabContext = createContext<QuickAddFabContextValue | undefined>(undefined);
