import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AuthContext, type User } from './authContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const res = await axios.get('/auth/me');
            setUser(res.data.user);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Auth check failed:', err);
            }
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

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
