import { createContext } from 'react';

export type WeightUnit = 'KG' | 'LB';
export type HeightUnit = 'CM' | 'FT_IN';

export type User = {
    id: number;
    email: string;
    weight_unit: WeightUnit;
    height_unit: HeightUnit;
    timezone: string;
    date_of_birth?: string | null;
    sex?: 'MALE' | 'FEMALE' | null;
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
    updateUnitPreferences: (preferences: { weight_unit?: WeightUnit; height_unit?: HeightUnit }) => Promise<void>;
    updateWeightUnit: (weight_unit: WeightUnit) => Promise<void>;
    updateHeightUnit: (height_unit: HeightUnit) => Promise<void>;
    updateProfile: (profile: UserProfilePatchPayload) => Promise<void>;
    updateProfileImage: (dataUrl: string | null) => Promise<void>;
    updateTimezone: (timezone: string) => Promise<void>;
    isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
