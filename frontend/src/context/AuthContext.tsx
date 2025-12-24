import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AuthContext, type UnitSystem, type User } from './authContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkAuth = useCallback(async () => {
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

    const updateUnits = async (preferences: { unit_system?: UnitSystem; weight_unit?: User['weight_unit'] }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
    };

    const updateTimezone = async (timezone: string) => {
        const res = await axios.patch('/api/user/profile', { timezone });
        setUser(res.data.user);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, updateUnits, updateTimezone, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};
