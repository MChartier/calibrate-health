import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { setHapticsEnabled } from '../utils/haptics';

function isCanceledRequest(error: unknown): boolean {
    return axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');
}

/**
 * AuthProvider bootstraps session state and exposes auth/profile mutations.
 *
 * It also keeps React Query caches in sync when the active user changes.
 */
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

    /**
     * Fetch the current session user (best-effort) to hydrate the app shell.
     */
    const checkAuth = useCallback(async (signal: AbortSignal) => {
        try {
            const res = await axios.get('/auth/me', { signal });
            setUser(res.data.user);
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (import.meta.env.DEV) {
                console.error('Auth check failed:', err);
            }
            setUser(null);
        } finally {
            if (!signal.aborted) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void checkAuth(controller.signal);
        return () => {
            controller.abort();
        };
    }, [checkAuth]);

    useEffect(() => {
        setHapticsEnabled(user?.haptics_enabled ?? true);
    }, [user?.haptics_enabled]);

    const login = useCallback(async (email: string, password: string) => {
        const res = await axios.post('/auth/login', { email, password });
        // Ensure no cross-user cache bleed when switching accounts.
        queryClient.clear();
        setUser(res.data.user);
    }, [queryClient]);

    const register = useCallback(async (email: string, password: string) => {
        const res = await axios.post('/auth/register', { email, password });
        // Ensure no cross-user cache bleed when switching accounts.
        queryClient.clear();
        setUser(res.data.user);
    }, [queryClient]);

    const logout = useCallback(async () => {
        await axios.post('/auth/logout');
        setUser(null);
        queryClient.clear();
    }, [queryClient]);

    /**
     * Change the authenticated user's password (server validates the current password).
     */
    const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
        await axios.patch('/api/user/password', {
            current_password: currentPassword,
            new_password: newPassword
        });
    }, []);

    /**
     * Patch user preferences (units) and keep the auth context in sync.
     */
    const updateUnitPreferences = useCallback(async (preferences: { weight_unit?: WeightUnit; height_unit?: HeightUnit }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
        // Values returned by /api/metrics and /api/goals are converted server-side using the user's weight_unit.
        // Invalidate cached queries so displayed values and unit labels stay in sync.
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        void queryClient.invalidateQueries({ queryKey: ['goal'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
    }, [queryClient]);

    /**
     * Update account-level reminder preferences that apply across all devices.
     */
    const updateReminderPreferences = useCallback(async (preferences: {
        reminder_log_weight_enabled?: boolean;
        reminder_log_food_enabled?: boolean;
    }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
    }, []);

    /**
     * Update feedback preferences that affect interaction affordances like haptics.
     */
    const updateFeedbackPreferences = useCallback(async (preferences: {
        haptics_enabled?: boolean;
    }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
    }, []);

    /**
     * Update the user's preferred weight unit (kg/lb).
     */
    const updateWeightUnit = useCallback(async (weight_unit: WeightUnit) => {
        await updateUnitPreferences({ weight_unit });
    }, [updateUnitPreferences]);

    /**
     * Update the user's preferred height unit (cm or ft/in).
     */
    const updateHeightUnit = useCallback(async (height_unit: HeightUnit) => {
        await updateUnitPreferences({ height_unit });
    }, [updateUnitPreferences]);

    /**
     * Update the user's preferred UI language (persisted server-side).
     */
    const updateLanguage = useCallback(async (language: AppLanguage) => {
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
    }, [user]);

    /**
     * Patch the authenticated user's profile and keep the auth context in sync with the server response.
     */
    const updateProfile = useCallback(async (profile: UserProfilePatchPayload) => {
        const res = await axios.patch('/api/user/profile', profile);
        setUser(res.data.user);
        void queryClient.invalidateQueries({ queryKey: ['food'] });
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
    }, [queryClient]);

    /**
     * Set (or clear) the authenticated user's processed profile photo.
     */
    const updateProfileImage = useCallback(async (dataUrl: string | null) => {
        const res = dataUrl
            ? await axios.put('/api/user/profile-image', { data_url: dataUrl })
            : await axios.delete('/api/user/profile-image');
        setUser(res.data.user);
    }, []);

    /**
     * Update the user's preferred IANA time zone identifier for date grouping and "today" calculations.
     */
    const updateTimezone = useCallback(async (timezone: string) => {
        await updateProfile({ timezone });
    }, [updateProfile]);

    const value = useMemo(
        () => ({
            user,
            login,
            register,
            logout,
            changePassword,
            updateUnitPreferences,
            updateReminderPreferences,
            updateFeedbackPreferences,
            updateWeightUnit,
            updateHeightUnit,
            updateLanguage,
            updateProfile,
            updateProfileImage,
            updateTimezone,
            isLoading
        }),
        [
            changePassword,
            isLoading,
            login,
            logout,
            register,
            updateFeedbackPreferences,
            updateHeightUnit,
            updateLanguage,
            updateProfile,
            updateProfileImage,
            updateReminderPreferences,
            updateTimezone,
            updateUnitPreferences,
            updateWeightUnit,
            user
        ]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
