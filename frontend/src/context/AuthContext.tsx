import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext, type User } from './authContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const queryClient = useQueryClient();

    useEffect(() => {
        // Keep the UI from getting "stuck" with a stale user when the session expires.
        const interceptorId = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    setUser(null);
                    queryClient.clear();
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(interceptorId);
        };
    }, [queryClient]);

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

    /**
     * Update the user's preferred IANA time zone identifier for date grouping and "today" calculations.
     */
    const updateTimezone = async (timezone: User['timezone']) => {
        const res = await axios.patch('/api/user/preferences', { timezone });
        setUser(res.data.user);
        void queryClient.invalidateQueries({ queryKey: ['food'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    };

    const updateWeightUnit = async (weight_unit: User['weight_unit']) => {
        const res = await axios.patch('/api/user/preferences', { weight_unit });
        setUser(res.data.user);
        // Values returned by /api/metrics and /api/goals are converted server-side using the user's weight_unit.
        // Invalidate cached queries so displayed values and unit labels stay in sync.
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        void queryClient.invalidateQueries({ queryKey: ['goal'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, updateWeightUnit, updateTimezone, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};
