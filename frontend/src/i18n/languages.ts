export const APP_LANGUAGES = {
    EN: 'en',
    ES: 'es',
    FR: 'fr',
    RU: 'ru'
} as const;

export type AppLanguage = (typeof APP_LANGUAGES)[keyof typeof APP_LANGUAGES];

export const DEFAULT_APP_LANGUAGE: AppLanguage = APP_LANGUAGES.EN;
