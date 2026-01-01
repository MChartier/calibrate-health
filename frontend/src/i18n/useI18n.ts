import { useContext } from 'react';
import { I18nContext } from './i18nContext';

/**
 * useI18n
 *
 * Access the active language and translation helper from `I18nProvider`.
 */
export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return ctx;
}
