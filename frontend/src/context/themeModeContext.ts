import { createContext } from 'react';
import type { PaletteMode } from '@mui/material';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ThemeModeContextValue = {
    /**
     * The user-selected preference. When set to `system`, we follow the OS/browser setting.
     */
    preference: ThemePreference;
    /**
     * The resolved MUI palette mode the app is currently using.
     */
    mode: PaletteMode;
    /**
     * Persist and apply a new theme preference.
     */
    setPreference: (next: ThemePreference) => void;
};

export const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

