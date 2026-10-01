import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { AppButton } from '../../src/components/AppButton';
import { AppSection } from '../../src/components/AppSection';
import { AppNotice } from '../../src/components/AppNotice';
import { AppText } from '../../src/components/AppText';
import { AuthBrand } from '../../src/components/auth/AuthBrand';
import { Screen } from '../../src/components/Screen';
import { ServerUrlControl } from '../../src/components/ServerUrlControl';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { accountDeletionCleanupGuidance } from '../../src/account/accountDeletionNotice';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../../src/config/server';
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { spacing, useAppTheme } from '../../src/theme';
import { getAuthActionErrorMessage } from '../../src/errors/presentation';

export default function LoginScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const {
        login, serverUrl, testServerUrl, serverConnection, authError,
        accountDeletionCleanupNotice, acknowledgeAccountDeletionCleanupNotice
    } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const canSelectServer = Platform.OS !== 'web';
    const routedServerDraft = canSelectServer ? readAuthServerDraft(params.serverUrl) : null;
    const [serverInput, setServerInput] = useState(routedServerDraft ?? serverUrl);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [isChoosingServer, setIsChoosingServer] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const previousRouteDraft = useRef(routedServerDraft);
    const previousServerUrl = useRef(serverUrl);
    const locallySelectedServer = useRef(false);
    useEffect(() => {
        const routeChanged = previousRouteDraft.current !== routedServerDraft;
        const savedServerChanged = previousServerUrl.current !== serverUrl;
        previousRouteDraft.current = routedServerDraft;
        previousServerUrl.current = serverUrl;
        // A switch can mount auth before provider persistence finishes. Follow that update,
        // but don't replace an intentional local choice with an older route parameter.
        if (!routeChanged && !(savedServerChanged && !routedServerDraft && !locallySelectedServer.current)) return;
        locallySelectedServer.current = false;
        setServerInput(routedServerDraft ?? serverUrl);
        setEmail('');
        setPassword('');
        setError(null);
    }, [routedServerDraft, serverUrl]);

    async function confirmServer(candidate: string): Promise<boolean> {
        if (!await testServerUrl(candidate)) return false;
        const normalized = normalizeServerUrl(candidate);
        if (!normalized) return false;
        if (normalized !== normalizeServerUrl(serverInput)) {
            setEmail('');
            setPassword('');
            setError(null);
        }
        locallySelectedServer.current = true;
        setServerInput(normalized);
        return true;
    }

    async function handleLogin() {
        if (accountDeletionCleanupNotice || submittingRef.current || isChoosingServer) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setError(null);
        try {
            await login(email, password, serverInput);
        } catch (err) {
            setError(getAuthActionErrorMessage(err, 'sign in'));
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <Screen contentWidth="form" safeTop style={styles.screen}>
            <AuthBrand description="Track food, weight, and progress against a personalized calorie target." />

            {accountDeletionCleanupNotice && (
                <AppNotice tone="warning" accessibilityLiveRegion="polite" style={[styles.cleanupNotice, { borderColor: colors.warning }]}>
                    <SectionHeader
                        title="Account deleted - device cleanup needed"
                        description={accountDeletionCleanupGuidance(accountDeletionCleanupNotice)}
                    />
                    <AppButton
                        title="I completed these steps"
                        variant="secondary"
                        onPress={() => void acknowledgeAccountDeletionCleanupNotice()}
                    />
                </AppNotice>
            )}

            <AppSection>
                <SectionHeader title="Sign in" description="Use your Calibrate account." />
                {canSelectServer && (
                    <ServerUrlControl
                        value={serverInput}
                        connection={serverConnection}
                        onTestConnection={testServerUrl}
                        onConfirmServer={confirmServer}
                        onEditingChange={setIsChoosingServer}
                        disabled={isSubmitting}
                    />
                )}
                {!canSelectServer && normalizeServerUrl(serverInput) !== HOSTED_SERVER_URL && (
                    <View style={{ gap: spacing.xs }}>
                        <AppText variant="label">Self-hosted server</AppText>
                        <AppText variant="caption" selectable>{serverInput}</AppText>
                        <AppText variant="caption">Use your account on this server. Your server operator provides support.</AppText>
                    </View>
                )}
                <TextField
                    label="Email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />
                <TextField
                    label="Password"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect={false}
                    textContentType="password"
                    returnKeyType="go"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={() => void handleLogin()}
                />
                <Link href={canSelectServer ? { pathname: '/forgot-password', params: { serverUrl: serverInput } } : '/forgot-password'} asChild>
                    <Pressable accessibilityRole="link" style={styles.inlineLinkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Forgot password?</AppText>
                    </Pressable>
                </Link>
                {(error || authError) && <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error ?? authError}</AppText>}
                <AppButton
                    title={isSubmitting ? 'Signing in...' : 'Sign in'}
                    disabled={isSubmitting || isChoosingServer || Boolean(accountDeletionCleanupNotice)}
                    onPress={() => void handleLogin()}
                />
            </AppSection>

            {!accountDeletionCleanupNotice && (
                <Link
                    href={canSelectServer ? {
                        pathname: '/(auth)/register',
                        params: { serverUrl: serverInput }
                    } : '/(auth)/register'}
                    asChild
                >
                    <Pressable accessibilityRole="link" style={styles.linkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Create an account</AppText>
                    </Pressable>
                </Link>
            )}

            <View style={styles.trustLinks}>
                <Link href={CALIBRATE_PRODUCT_LINKS.privacy as Href} asChild>
                    <Pressable accessibilityRole="link" style={styles.trustLinkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Privacy policy</AppText>
                    </Pressable>
                </Link>
                <Link href={CALIBRATE_PRODUCT_LINKS.terms as Href} asChild>
                    <Pressable accessibilityRole="link" style={styles.trustLinkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Terms of service</AppText>
                    </Pressable>
                </Link>
                <Link href={CALIBRATE_PRODUCT_LINKS.support as Href} asChild>
                    <Pressable accessibilityRole="link" style={styles.trustLinkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Support</AppText>
                    </Pressable>
                </Link>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        justifyContent: 'center',
        flexGrow: 1,
        width: '100%',
        alignSelf: 'center'
    },
    cleanupNotice: {
        borderWidth: StyleSheet.hairlineWidth
    },
    linkTarget: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center'
    },
    inlineLinkTarget: {
        minHeight: 48,
        alignItems: 'flex-start',
        justifyContent: 'center'
    },
    trustLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center'
    },
    trustLinkTarget: {
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm
    },
    link: {
        fontWeight: '600',
        textAlign: 'center'
    }
});
