import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    id: number;
    email: string;
    weight_unit: 'KG' | 'LB';
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    updateWeightUnit: (weight_unit: User['weight_unit']) => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            console.log('Checking auth...');
            const res = await axios.get('/auth/me');
            console.log('Auth response:', res.data);
            setUser(res.data.user);
        } catch (err) {
            console.error('Auth check failed:', err);
            setUser(null);
        } finally {
            setIsLoading(false);
            console.log('Auth check complete, isLoading: false');
        }
    };

    const login = async (email: string, password: string) => {
        const res = await axios.post('/auth/login', { email, password });
        setUser(res.data.user);
    };

    const register = async (email: string, password: string) => {
        const res = await axios.post('/auth/register', { email, password });
        setUser(res.data.user);
    };

    const logout = async () => {
        await axios.post('/auth/logout');
        setUser(null);
    };

    const updateWeightUnit = async (weight_unit: User['weight_unit']) => {
        const res = await axios.patch('/api/user/preferences', { weight_unit });
        setUser(res.data.user);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, updateWeightUnit, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
