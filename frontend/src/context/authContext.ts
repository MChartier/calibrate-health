import { createContext } from 'react';

export type WeightUnit = 'KG' | 'LB';

export type User = {
    id: number;
    email: string;
    weight_unit: WeightUnit;
};

export type AuthContextType = {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    updateWeightUnit: (weight_unit: User['weight_unit']) => Promise<void>;
    isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

