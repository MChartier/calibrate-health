import React, { useEffect, useMemo, useState } from 'react';
import type { PaletteMode } from '@mui/material';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { createAppTheme } from '../theme';
import { ThemeModeContext, type ThemeModeContextValue, type ThemePreference } from './themeModeContext';

const THEME_PREFERENCE_STORAGE_KEY = 'calibrate.themePreference';
const LEGACY_THEME_PREFERENCE_STORAGE_KEY = 'calio.themePreference';

/**
 * Type guard for values we allow to be stored/used as theme preferences.
 */
function isThemePreference(value: unknown): value is ThemePreference {
    return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Read the persisted theme preference from localStorage, returning `null` when missing/unavailable.
 */
function readStoredThemePreference(): ThemePreference | null {
    try {
        const stored = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
        if (isThemePreference(stored)) return stored;

        const legacyStored = window.localStorage.getItem(LEGACY_THEME_PREFERENCE_STORAGE_KEY);
        if (isThemePreference(legacyStored)) {
            // Best-effort migrate legacy cal-io branding to calibrate without losing user preference.
            window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, legacyStored);
            window.localStorage.removeItem(LEGACY_THEME_PREFERENCE_STORAGE_KEY);
            return legacyStored;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Persist the theme preference to localStorage, swallowing errors for restricted environments.
 */
function persistThemePreference(preference: ThemePreference) {
    try {
        window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    } catch {
        // Ignore storage failures (e.g., privacy mode, blocked storage).
    }
}

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

    const [preference, setPreference] = useState<ThemePreference>(() => readStoredThemePreference() ?? 'light');

    useEffect(() => {
        persistThemePreference(preference);
    }, [preference]);

    const mode: PaletteMode = useMemo(() => {
        if (preference === 'system') {
            return systemPrefersDark ? 'dark' : 'light';
        }
        return preference;
    }, [preference, systemPrefersDark]);

    const theme = useMemo(() => createAppTheme(mode), [mode]);

    const value: ThemeModeContextValue = useMemo(
        () => ({
            preference,
            mode,
            setPreference
        }),
        [mode, preference, setPreference]
    );

    return (
        <ThemeModeContext.Provider value={value}>
            <ThemeProvider theme={theme}>
                <CssBaseline enableColorScheme />
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
};
