import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import {
    AuthContext,
    type HeightUnit,
    type User,
    type UserProfilePatchPayload,
    type WeightUnit
} from './authContext';
import type { AppLanguage } from '../i18n/languages';

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
        void checkAuth();
    }, [checkAuth]);

    const login = async (email: string, password: string) => {
        const res = await axios.post('/auth/login', { email, password });
        // Ensure no cross-user cache bleed when switching accounts.
        queryClient.clear();
        setUser(res.data.user);
    };

    const register = async (email: string, password: string) => {
        const res = await axios.post('/auth/register', { email, password });
        // Ensure no cross-user cache bleed when switching accounts.
        queryClient.clear();
        setUser(res.data.user);
    };

    const logout = async () => {
        await axios.post('/auth/logout');
        setUser(null);
        queryClient.clear();
    };

    /**
     * Change the authenticated user's password (server validates the current password).
     */
    const changePassword = async (currentPassword: string, newPassword: string) => {
        await axios.patch('/api/user/password', {
            current_password: currentPassword,
            new_password: newPassword
        });
    };

    /**
     * Patch user preferences (units) and keep the auth context in sync.
     */
    const updateUnitPreferences = async (preferences: { weight_unit?: WeightUnit; height_unit?: HeightUnit }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
        // Values returned by /api/metrics and /api/goals are converted server-side using the user's weight_unit.
        // Invalidate cached queries so displayed values and unit labels stay in sync.
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        void queryClient.invalidateQueries({ queryKey: ['goal'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
    };

    /**
     * Update the user's preferred weight unit (kg/lb).
     */
    const updateWeightUnit = async (weight_unit: WeightUnit) => {
        await updateUnitPreferences({ weight_unit });
    };

    /**
     * Update the user's preferred height unit (cm or ft/in).
     */
    const updateHeightUnit = async (height_unit: HeightUnit) => {
        await updateUnitPreferences({ height_unit });
    };

    /**
     * Update the user's preferred UI language (persisted server-side).
     */
    const updateLanguage = async (language: AppLanguage) => {
        if (!user) {
            throw new Error('Not authenticated');
        }

        const previousUser = user;
        setUser({ ...user, language });

        try {
            const res = await axios.patch('/api/user/preferences', { language });
            setUser(res.data.user);
        } catch (err) {
            setUser(previousUser);
            throw err;
        }
    };

    /**
     * Patch the authenticated user's profile and keep the auth context in sync with the server response.
     */
    const updateProfile = async (profile: UserProfilePatchPayload) => {
        const res = await axios.patch('/api/user/profile', profile);
        setUser(res.data.user);
        void queryClient.invalidateQueries({ queryKey: ['food'] });
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
    };

    /**
     * Set (or clear) the authenticated user's processed profile photo.
     */
    const updateProfileImage = async (dataUrl: string | null) => {
        const res = dataUrl
            ? await axios.put('/api/user/profile-image', { data_url: dataUrl })
            : await axios.delete('/api/user/profile-image');
        setUser(res.data.user);
    };

    /**
     * Update the user's preferred IANA time zone identifier for date grouping and "today" calculations.
     */
    const updateTimezone = async (timezone: string) => {
        await updateProfile({ timezone });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                register,
                logout,
                changePassword,
                updateUnitPreferences,
                updateWeightUnit,
                updateHeightUnit,
                updateLanguage,
                updateProfile,
                updateProfileImage,
                updateTimezone,
                isLoading
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
