import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type ServerSettingsResponse } from '@calibrate/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { AppButton } from '../components/AppButton';
import { AppNotice } from '../components/AppNotice';
import { AppSection } from '../components/AppSection';
import { AppText } from '../components/AppText';
import { PreferenceSwitch } from '../settings/SettingsPrimitives';
import { useOnlineStatus } from '../components/AsyncStateBoundary';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { TabScreen } from '../components/TabScreen';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { serverSettingsQueryKey, useServerSettings } from './useServerSettings';
import { ServerDeploymentGuidance, ServerOverview } from './ServerOverview';
import { ServerUserManagement } from './ServerUserManagement';

// Reserve the settings control's space while its server value loads.
const SETTINGS_PLACEHOLDER_HEIGHT = 64;

export default function ServerSettingsScreen() {
    const { serverUrl, user } = useAuth();
    // A server/account change starts fresh controls, including any in-flight save feedback.
    return <ScopedServerSettingsScreen key={`${serverUrl}:${user?.id ?? 'signed-out'}`} />;
}

function ScopedServerSettingsScreen() {
    const { api, user, isLoading, serverUrl } = useAuth();
    const settings = useServerSettings();
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();
    const activeScope = useRef(true);
    const requestController = useRef(new AbortController());
    useEffect(() => {
        activeScope.current = true;
        if (requestController.current.signal.aborted) requestController.current = new AbortController();
        return () => {
            activeScope.current = false;
            requestController.current.abort();
        };
    }, []);
    const [hasLostAuthorization, setHasLostAuthorization] = useState(false);
    const handleAuthorizationLost = useCallback(() => setHasLostAuthorization(true), []);
    const mutation = useMutation({
        mutationFn: (enabled: boolean) => api.updateServerSettings({ nutrition_label_scanning: enabled }, requestController.current.signal),
        onSuccess: async (response) => {
            if (!activeScope.current) return;
            const queryKey = serverSettingsQueryKey(serverUrl, user?.id);
            await queryClient.cancelQueries({ queryKey });
            if (!activeScope.current) return;
            queryClient.setQueryData<ServerSettingsResponse>(queryKey, (current) => ({
                ...response,
                // Feature saves cannot restore a role revoked while the request was in flight.
                is_admin: response.is_admin && current?.is_admin !== false
            }));
        },
        onError: async (error) => {
            if (!activeScope.current) return;
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                handleAuthorizationLost();
                await queryClient.invalidateQueries({ queryKey: serverSettingsQueryKey(serverUrl, user?.id) });
            }
        }
    });
    let toggleStatus = settings.nutritionLabelScanning ? 'On' : 'Off';
    if (mutation.isPending) toggleStatus = 'Saving setting...';

    if (!isLoading && !user) return <Redirect href="/login" />;

    let content;
    if (!isOnline) {
        content = <AppNotice tone="warning"><AppText>Connect to the server to manage its settings.</AppText></AppNotice>;
    } else if (settings.isPending || isLoading) {
        content = <AppSection><AppText>Loading server settings...</AppText><SkeletonBlock height={SETTINGS_PLACEHOLDER_HEIGHT} /></AppSection>;
    } else if (settings.isError) {
        content = <AppSection>
            <AppNotice tone="danger" accessibilityRole="alert"><AppText>Server settings could not be loaded.</AppText></AppNotice>
            <AppButton title="Try again" variant="secondary" onPress={() => void settings.refetch()} />
        </AppSection>;
    } else if (!settings.isAdmin) {
        content = <AppNotice tone="warning"><AppText>Server administrator access is required to change these settings.</AppText></AppNotice>;
    } else if (hasLostAuthorization) {
        content = <AppSection>
            <AppNotice tone="warning" accessibilityRole="alert"><AppText>Administrator access could not be confirmed. Check your server permissions again.</AppText></AppNotice>
            <AppButton title="Check permissions" variant="secondary" busy={settings.isFetching} onPress={async () => {
                const result = await settings.refetch();
                if (result.isSuccess) setHasLostAuthorization(false);
            }} />
        </AppSection>;
    } else {
        content = <>
            <ServerOverview onRefreshSettings={() => settings.refetch()} />
            <AppSection divider>
                <SectionHeader title="Experimental features" description="Changes apply to everyone using this server. They are saved immediately." />
                <PreferenceSwitch
                    label="Nutrition label scanning"
                    value={settings.nutritionLabelScanning}
                    disabled={mutation.isPending}
                    onValueChange={(enabled) => mutation.mutate(enabled)}
                />
                <AppText accessibilityLiveRegion="polite">{toggleStatus}</AppText>
                <AppText variant="muted">Read calories and serving sizes from a label photo. Results may be incomplete or inaccurate and must be reviewed before saving.</AppText>
                <AppText variant="caption">Turning this off blocks new scans immediately. Saved foods are unaffected.</AppText>
                {mutation.isError && <AppNotice tone="danger" accessibilityRole="alert"><AppText>{getSafeActionErrorMessage(mutation.error, 'The setting could not be saved. Try again.')}</AppText></AppNotice>}
                {mutation.isSuccess && <AppText accessibilityLiveRegion="polite">Server settings saved.</AppText>}
            </AppSection>
            <ServerUserManagement onAuthorizationLost={handleAuthorizationLost} />
            <ServerDeploymentGuidance />
        </>;
    }

    return <TabScreen contentWidth="overview">
        <AppSection>
            <SectionHeader title="Server administration" description="Review this server's capabilities and manage settings for everyone connected to it." />
        </AppSection>
        {content}
    </TabScreen>;
}
