import { createContext } from 'react';
import type { AppLanguage } from './languages';
import type { TranslationKey } from './resources';

export type TranslationParams = Record<string, string | number>;

export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

export type I18nContextValue = {
    language: AppLanguage;
    t: Translate;
};

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

