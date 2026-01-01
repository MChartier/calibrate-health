import React, { useEffect, useMemo } from 'react';
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from './languages';
import { TRANSLATIONS } from './resources';
import { I18nContext, type I18nContextValue, type Translate, type TranslationParams } from './i18nContext';

type I18nProviderProps = {
    language?: AppLanguage;
    children: React.ReactNode;
};

/**
 * Replace `{token}` placeholders in a translated string with runtime values.
 */
function interpolate(template: string, params?: TranslationParams): string {
    if (!params) return template;

    return template.replaceAll(/\{(\w+)\}/g, (match, token: string) => {
        const value = params[token];
        if (value === undefined || value === null) return match;
        return String(value);
    });
}

/**
 * I18nProvider
 *
 * Provides a minimal translation function (`t`) and the active language code.
 */
export const I18nProvider: React.FC<I18nProviderProps> = ({ language = DEFAULT_APP_LANGUAGE, children }) => {
    const value = useMemo<I18nContextValue>(() => {
        const messages = TRANSLATIONS[language] ?? TRANSLATIONS[DEFAULT_APP_LANGUAGE];
        const fallbackMessages = TRANSLATIONS[DEFAULT_APP_LANGUAGE];

        const t: Translate = (key, params) => {
            const template = messages[key] ?? fallbackMessages[key] ?? key;
            return interpolate(template, params);
        };

        return { language, t };
    }, [language]);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
