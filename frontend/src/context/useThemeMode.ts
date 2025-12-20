import { useContext } from 'react';
import { ThemeModeContext, type ThemeModeContextValue } from './themeModeContext';

/**
 * Read/write access to the global theme preference (light/dark/system).
 */
export function useThemeMode(): ThemeModeContextValue {
    const context = useContext(ThemeModeContext);
    if (!context) {
        throw new Error('useThemeMode must be used within a ThemeModeProvider');
    }
    return context;
}

