export const APP_LANGUAGES = {
    EN: 'en',
    ES: 'es',
    FR: 'fr',
    RU: 'ru'
} as const;

export type AppLanguage = (typeof APP_LANGUAGES)[keyof typeof APP_LANGUAGES];

export const DEFAULT_APP_LANGUAGE: AppLanguage = APP_LANGUAGES.EN;

/**
 * Type guard for supported app language codes.
 */
export function isAppLanguage(value: unknown): value is AppLanguage {
    return (
        value === APP_LANGUAGES.EN ||
        value === APP_LANGUAGES.ES ||
        value === APP_LANGUAGES.FR ||
        value === APP_LANGUAGES.RU
    );
}

