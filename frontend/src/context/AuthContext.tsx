import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AuthContext, type User, type UserProfilePatchPayload } from './authContext';

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

    /**
     * Patch user preferences (currently unit-related) and keep the auth context in sync.
     */
    const updateUnitPreferences = async (preferences: {
        weight_unit?: User['weight_unit'];
        height_unit?: User['height_unit'];
    }) => {
        const res = await axios.patch('/api/user/preferences', preferences);
        setUser(res.data.user);
    };

    /**
     * Update the user's preferred weight unit (kg/lb).
     */
    const updateWeightUnit = async (weight_unit: User['weight_unit']) => {
        await updateUnitPreferences({ weight_unit });
    };

    /**
     * Update the user's preferred height unit (cm or ft/in).
     */
    const updateHeightUnit = async (height_unit: User['height_unit']) => {
        await updateUnitPreferences({ height_unit });
    };

    /**
     * Patch the authenticated user's profile and keep the auth context in sync with the server response.
     */
    const updateProfile = async (profile: UserProfilePatchPayload) => {
        const res = await axios.patch('/api/user/profile', profile);
        setUser(res.data.user);
    };

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
                updateUnitPreferences,
                updateWeightUnit,
                updateHeightUnit,
                updateProfile,
                updateTimezone,
                isLoading
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
