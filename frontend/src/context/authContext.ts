import { createContext } from 'react';
import type { AppLanguage } from '../i18n/languages';

export type WeightUnit = 'KG' | 'LB';
export type HeightUnit = 'CM' | 'FT_IN';

/**
 * Runtime constants for unit values.
 *
 * These mirror the `WeightUnit` / `HeightUnit` string union types and give us a single source of truth
 * for comparisons and <Select /> values without sprinkling raw string literals throughout the UI.
 */
export const WEIGHT_UNITS = {
    KG: 'KG',
    LB: 'LB'
} as const satisfies Record<string, WeightUnit>;

export const HEIGHT_UNITS = {
    CM: 'CM',
    FT_IN: 'FT_IN'
} as const satisfies Record<string, HeightUnit>;

/**
 * Runtime constants for `User.sex` values returned by the API.
 */
export const SEX_VALUES = {
    MALE: 'MALE',
    FEMALE: 'FEMALE'
} as const;

export type SexValue = (typeof SEX_VALUES)[keyof typeof SEX_VALUES];

export type User = {
    id: number;
    email: string;
    /**
     * Account creation timestamp (ISO string).
     *
     * Used for UX bounds (e.g. earliest selectable day on /log).
     */
    created_at: string;
    weight_unit: WeightUnit;
    height_unit: HeightUnit;
    timezone: string;
    language: AppLanguage;
    date_of_birth?: string | null;
    sex?: SexValue | null;
    height_mm?: number | null;
    activity_level?: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE' | null;
    /** Optional inline avatar payload returned by the API (data URL). */
    profile_image_url?: string | null;
};

export type UserProfilePatchPayload = {
    timezone?: string | null;
    date_of_birth?: string | null;
    sex?: string | null;
    activity_level?: string | null;
    height_cm?: string | null;
    height_mm?: number | string | null;
    height_feet?: string | null;
    height_inches?: string | null;
};

export type AuthContextType = {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Update the authenticated user's password (current password required). */
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    updateUnitPreferences: (preferences: { weight_unit?: WeightUnit; height_unit?: HeightUnit }) => Promise<void>;
    updateWeightUnit: (weight_unit: WeightUnit) => Promise<void>;
    updateHeightUnit: (height_unit: HeightUnit) => Promise<void>;
    updateLanguage: (language: AppLanguage) => Promise<void>;
    updateProfile: (profile: UserProfilePatchPayload) => Promise<void>;
    updateProfileImage: (dataUrl: string | null) => Promise<void>;
    updateTimezone: (timezone: string) => Promise<void>;
    isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
