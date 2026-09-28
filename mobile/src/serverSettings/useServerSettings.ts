import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useOnlineStatus } from '../components/AsyncStateBoundary';

export const serverSettingsQueryKey = (serverUrl: string, userId?: number) =>
    ['server-settings', serverUrl, userId] as const;

export function useServerSettings() {
    const { api, user, serverUrl } = useAuth();
    const isOnline = useOnlineStatus();
    const enabled = Boolean(user) && isOnline;
    const query = useQuery({
        queryKey: serverSettingsQueryKey(serverUrl, user?.id),
        queryFn: ({ signal }) => api.getServerSettings(signal),
        enabled,
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always'
    });
    const { refetch } = query;
    useEffect(() => {
        if (Platform.OS === 'web' || !enabled) return;
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void refetch();
        });
        return () => subscription.remove();
    }, [enabled, refetch]);

    return {
        ...query,
        // Failed refreshes and offline sessions must not keep an experiment enabled.
        nutritionLabelScanning: enabled && !query.isError && query.data?.features?.nutrition_label_scanning === true,
        isAdmin: enabled && !query.isError && query.data?.is_admin === true
    };
}
