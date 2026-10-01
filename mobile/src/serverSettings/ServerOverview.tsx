import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { CALIBRATE_PROJECT_URL } from '@calibrate/shared/product';
import { useAuth } from '../auth/AuthContext';
import { AppButton } from '../components/AppButton';
import { AppNotice } from '../components/AppNotice';
import { AppSection } from '../components/AppSection';
import { AppText } from '../components/AppText';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../config/server';
import { SummaryRow } from '../settings/SettingsPrimitives';
import { useAppTheme } from '../theme';

// Keep the release summary stable while the server answers its capability request.
const SERVER_DETAILS_PLACEHOLDER_HEIGHT = 120;
const SELF_HOSTING_GUIDE_URL = `${CALIBRATE_PROJECT_URL}/blob/master/deploy/README.md`;

const serverOverviewQueryKey = (serverUrl: string, userId?: number) =>
    ['server-administration', serverUrl, userId, 'client-config'] as const;

function CapabilityRow({ label, enabled }: { label: string; enabled?: boolean }) {
    let value = 'Not reported';
    if (enabled === true) value = 'Available';
    if (enabled === false) value = 'Not enabled';
    return <SummaryRow label={label} value={value} />;
}

/** Mount only after the connected account's administrator role is confirmed. */
export function ServerOverview({ onRefreshSettings }: { onRefreshSettings: () => Promise<unknown> }) {
    const { api, serverUrl, user } = useAuth();
    const isManaged = normalizeServerUrl(serverUrl) === HOSTED_SERVER_URL;
    const config = useQuery({
        queryKey: serverOverviewQueryKey(serverUrl, user?.id),
        queryFn: () => api.getClientConfig({ cache: 'no-store' }),
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always'
    });
    // A failed recheck must not leave old capabilities looking like a current response.
    const details = config.isError ? undefined : config.data;

    async function refreshServer() {
        await Promise.all([config.refetch(), onRefreshSettings()]);
    }

    return <>
        <AppSection>
            <SectionHeader
                title="Connected server"
                description={isManaged
                    ? 'The official Calibrate managed service.'
                    : 'This self-hosted server is operated independently of the Calibrate managed service.'}
            />
            <SummaryRow label="Service" value={isManaged ? 'Calibrate managed service' : 'Self-hosted service'} />
            <AppSection density="compact">
                <AppText variant="caption">Server address</AppText>
                <AppText selectable>{serverUrl}</AppText>
            </AppSection>
        </AppSection>
        <AppSection divider>
            <SectionHeader title="Server details" description="Version and capabilities reported by this server." />
            {config.isPending && <>
                <AppText>Loading server details...</AppText>
                <SkeletonBlock height={SERVER_DETAILS_PLACEHOLDER_HEIGHT} />
            </>}
            {config.isError && <AppNotice tone="warning" accessibilityRole="alert">
                <AppText>Server details could not be checked. Check your connection and try again.</AppText>
            </AppNotice>}
            {details && <>
                <AppText variant="label" accessibilityLiveRegion="polite">
                    {config.isFetching ? 'Checking server details...' : 'Server responded'}
                </AppText>
                <SummaryRow label="Server version" value={details.server_version} />
                <SummaryRow label="Current API" value={details.api_versions.current} />
                <SummaryRow label="Supported APIs" value={details.api_versions.supported.join(', ')} />
                <SummaryRow label="Minimum phone version" value={details.min_supported_mobile_version} />
                <SummaryRow label="Minimum Wear OS version" value={details.min_supported_wear_version} />
                <AppText variant="caption">This check confirms the server can report its configuration. It does not verify backups or delivery of notifications.</AppText>
            </>}
            <AppButton
                title={config.isFetching ? 'Checking server...' : 'Check server again'}
                variant="secondary"
                disabled={config.isFetching}
                onPress={() => void refreshServer()}
            />
        </AppSection>
        {details && <AppSection divider>
            <SectionHeader title="Client capabilities" description="Server support is separate from each person's device permissions and preferences." />
            <CapabilityRow label="Phone push notifications" enabled={details.capabilities.native_push} />
            <CapabilityRow label="Browser push notifications" enabled={details.capabilities.web_push} />
            <CapabilityRow label="Health Connect activity" enabled={details.capabilities.health_connect_activity} />
            <CapabilityRow label="Wear OS companion" enabled={details.capabilities.wear_os_ready} />
        </AppSection>}
    </>;
}

export function ServerDeploymentGuidance() {
    const theme = useAppTheme();
    return <AppSection divider>
        <SectionHeader title="Deployment settings" description="These are managed in the server environment by the deployment operator." />
        <AppSection density="compact">
            <AppText variant="label">Email and integrations</AppText>
            <AppText variant="muted">Configure email delivery, food providers, and push notifications in the server environment. Keep credentials in your deployment's secret store.</AppText>
        </AppSection>
        <AppSection density="compact">
            <AppText variant="label">Backups and updates</AppText>
            <AppText variant="muted">Use your deployment tools to manage database backups and server releases. Take a backup before upgrading and test recovery regularly.</AppText>
        </AppSection>
        <Link
            href={SELF_HOSTING_GUIDE_URL}
            accessibilityLabel="Read the self-hosting guide"
            style={{ color: theme.colors.primary, paddingVertical: theme.spacing.md }}
        >
            Read the self-hosting guide
        </Link>
    </AppSection>;
}
