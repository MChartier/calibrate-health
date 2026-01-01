import React from 'react';
import { useAuth } from '../context/useAuth';
import { I18nProvider } from './I18nContext.tsx';
import { DEFAULT_APP_LANGUAGE } from './languages';

export type I18nFromAuthProps = {
    children: React.ReactNode;
};

/**
 * I18nFromAuth bridges the authenticated user's language preference into `I18nProvider`.
 */
export const I18nFromAuth: React.FC<I18nFromAuthProps> = ({ children }) => {
    const { user } = useAuth();
    const language = user?.language ?? DEFAULT_APP_LANGUAGE;
    return <I18nProvider language={language}>{children}</I18nProvider>;
};
