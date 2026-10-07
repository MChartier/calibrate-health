import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/auth/AuthContext';
import { AppButton } from '../../../src/components/AppButton';
import { AppNotice } from '../../../src/components/AppNotice';
import { AppSection } from '../../../src/components/AppSection';
import { AppText } from '../../../src/components/AppText';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { ServerUrlControl } from '../../../src/components/ServerUrlControl';
import { TabScreen } from '../../../src/components/TabScreen';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../../../src/config/server';
import { useOfflineOutbox } from '../../../src/offline/provider';
import { useServerSettings } from '../../../src/serverSettings/useServerSettings';

/** Service identity belongs with the account, separate from app diagnostics. */
export default function ServiceSettingsScreen() {
    const { serverUrl, user, serverConnection, testServerUrl, setServerUrl } = useAuth();
    const outbox = useOfflineOutbox();
    const settings = useServerSettings();
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const checkingRef = useRef(false);
    const isHosted = normalizeServerUrl(serverUrl) === HOSTED_SERVER_URL;
    const isWeb = Platform.OS === 'web';
    const hasUnsyncedChanges = outbox.mutations.length > 0;
    const switchBlocked = !outbox.isReady || Boolean(outbox.initializationError) || hasUnsyncedChanges;
    const showConnection = serverConnection.testedUrl === normalizeServerUrl(serverUrl)
        && serverConnection.status !== 'idle';

    async function checkConnection() {
        if (checkingRef.current) return;
        checkingRef.current = true;
        setIsChecking(true);
        setCheckError(null);
        try {
            await testServerUrl(serverUrl);
        } catch {
            setCheckError('Could not check this service. Try again.');
        } finally {
            checkingRef.current = false;
            setIsChecking(false);
        }
    }

    return <TabScreen contentWidth="form">
        <AppSection>
            <SectionHeader title="Your service" description="Where your Calibrate account and health data are stored." />
            <AppText variant="label">{isHosted ? 'Calibrate managed hosting' : 'Self-hosted server'}</AppText>
            <AppText selectable>{serverUrl}</AppText>
            <AppText variant="caption">Signed in as {user?.email}</AppText>
            <AppText variant="muted">{isHosted
                ? 'Use Calibrate without managing a server. Your account is connected to the managed service.'
                : 'This deployment is operated independently. Contact your server administrator for account help, availability, privacy, and backups.'}</AppText>
            {showConnection && <AppNotice tone={serverConnection.status === 'error' ? 'danger' : 'info'} accessibilityLiveRegion="polite"><AppText>{serverConnection.message}</AppText></AppNotice>}
            {checkError && <AppNotice tone="danger" accessibilityRole="alert"><AppText>{checkError}</AppText></AppNotice>}
            <AppButton title="Check connection" variant="secondary" busy={isChecking} busyLabel="Checking..." onPress={() => void checkConnection()} />
        </AppSection>
        <AppSection>
            <SectionHeader title="Using another service" description="An account on one service does not sign you in to another. Switching does not move your data." />
            {isWeb ? (
                <AppText variant="muted">This browser stays connected to the website you opened. To use another deployment, open its trusted HTTPS address in your browser, or choose it in the Calibrate mobile app.</AppText>
            ) : (
                <>
                    {switchBlocked && <AppNotice tone="warning"><AppText>{hasUnsyncedChanges
                        ? 'Sync or review your offline changes in Data & privacy before switching services.'
                        : 'Offline changes must finish loading before you can safely switch services. If this continues, reopen Calibrate.'}</AppText></AppNotice>}
                    {hasUnsyncedChanges && <AppButton title="Review offline changes" variant="secondary" onPress={() => router.push('/data')} />}
                    <ServerUrlControl
                        value={serverUrl}
                        connection={serverConnection}
                        onTestConnection={testServerUrl}
                        onConfirmServer={async (candidate) => {
                            if (switchBlocked) return false;
                            return setServerUrl(candidate);
                        }}
                        switchingAccount
                        disabled={switchBlocked || isChecking}
                    />
                </>
            )}
        </AppSection>
        {settings.isAdmin && <AppSection>
            <SectionHeader title="Administration" description="Your account can manage shared settings on this service." />
            <AppButton title="Open server administration" variant="secondary" onPress={() => router.push('/server-admin')} />
        </AppSection>}
    </TabScreen>;
}
