import { createContext } from 'react';

export type WeightUnit = 'KG' | 'LB';

export type User = {
    id: number;
    email: string;
    weight_unit: WeightUnit;
    timezone?: string;
    date_of_birth?: string | null;
    sex?: 'MALE' | 'FEMALE' | null;
    height_mm?: number | null;
    activity_level?: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE' | null;
};

export type AuthContextType = {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    updateWeightUnit: (weight_unit: User['weight_unit']) => Promise<void>;
    updateTimezone: (timezone: string) => Promise<void>;
    isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
