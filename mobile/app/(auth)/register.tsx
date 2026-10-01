import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { AppButton } from '../../src/components/AppButton';
import { AppSection } from '../../src/components/AppSection';
import { AppText } from '../../src/components/AppText';
import { AuthBrand } from '../../src/components/auth/AuthBrand';
import { Screen } from '../../src/components/Screen';
import { ServerUrlControl } from '../../src/components/ServerUrlControl';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { LegalConsentFields } from '../../src/components/legal/LegalConsentFields';
import { useAuth } from '../../src/auth/AuthContext';
import { HOSTED_SERVER_URL, normalizeServerUrl } from '../../src/config/server';
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { spacing, useAppTheme } from '../../src/theme';
import { getAuthActionErrorMessage } from '../../src/errors/presentation';
import { requiresHostedLegalAcceptance } from '../../src/auth/accountAccess';
import {
    MAX_AUTH_PASSWORD_BYTES,
    MIN_AUTH_PASSWORD_LENGTH,
    normalizeAuthEmailCredential,
    utf8ByteLength
} from '../../../shared/authCredentials';

export default function RegisterScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const { register, serverUrl, testServerUrl, serverConnection, authError } = useAuth();
    const canSelectServer = Platform.OS !== 'web';
    const routedServerDraft = canSelectServer ? readAuthServerDraft(params.serverUrl) : null;
    const [serverInput, setServerInput] = useState(routedServerDraft ?? serverUrl);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [consentError, setConsentError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [isChoosingServer, setIsChoosingServer] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const legalConsentRequired = requiresHostedLegalAcceptance(serverInput);

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
        setConfirmPassword('');
        setTermsAccepted(false);
        setPrivacyAccepted(false);
        setConsentError(null);
    }, [routedServerDraft, serverUrl]);

    async function confirmServer(candidate: string): Promise<boolean> {
        if (!await testServerUrl(candidate)) return false;
        const normalized = normalizeServerUrl(candidate);
        if (!normalized) return false;
        if (normalized !== normalizeServerUrl(serverInput)) {
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setTermsAccepted(false);
            setPrivacyAccepted(false);
            setConsentError(null);
            setError(null);
        }
        locallySelectedServer.current = true;
        setServerInput(normalized);
        return true;
    }

    async function handleRegister() {
        if (submittingRef.current || isChoosingServer) return;
        const normalizedEmail = normalizeAuthEmailCredential(email);
        if (!normalizedEmail) {
            setError('Enter a valid email address.');
            return;
        }
        if (password.length < MIN_AUTH_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (utf8ByteLength(password) > MAX_AUTH_PASSWORD_BYTES) {
            setError(`Password must be at most ${MAX_AUTH_PASSWORD_BYTES} bytes.`);
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (legalConsentRequired && (!termsAccepted || !privacyAccepted)) {
            setConsentError('Review and accept both legal documents to create an account.');
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        setError(null);
        setConsentError(null);
        try {
            await register(normalizedEmail, password, serverInput, {
                acceptTerms: termsAccepted,
                acceptPrivacy: privacyAccepted
            });
        } catch (err) {
            setError(getAuthActionErrorMessage(err, 'create account'));
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <Screen contentWidth="form" safeTop style={styles.screen}>
            <AuthBrand description="Track food, weight, and progress against a personalized calorie target." />

            <AppSection>
                <SectionHeader title="Create account" description="Create your Calibrate account with email and password." />
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
                    autoComplete="new-password"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="next"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />
                <TextField
                    label="Confirm password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="go"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={() => void handleRegister()}
                />
                {legalConsentRequired && <LegalConsentFields
                    termsAccepted={termsAccepted}
                    privacyAccepted={privacyAccepted}
                    onTermsAcceptedChange={(checked) => {
                        setTermsAccepted(checked);
                        if (consentError) setConsentError(null);
                    }}
                    onPrivacyAcceptedChange={(checked) => {
                        setPrivacyAccepted(checked);
                        if (consentError) setConsentError(null);
                    }}
                    disabled={isSubmitting}
                    error={consentError}
                />}

                {(error || authError) && <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error ?? authError}</AppText>}
                <AppButton title={isSubmitting ? 'Creating...' : 'Create account'} disabled={isSubmitting || isChoosingServer} onPress={() => void handleRegister()} />
            </AppSection>

            <View style={styles.footerLinks}>
                <Link
                    href={canSelectServer ? {
                        pathname: '/(auth)/login',
                        params: { serverUrl: serverInput }
                    } : '/(auth)/login'}
                    asChild
                >
                    <Pressable accessibilityRole="link" style={styles.linkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Back to sign in</AppText>
                    </Pressable>
                </Link>
                <Link href={CALIBRATE_PRODUCT_LINKS.support as Href} asChild>
                    <Pressable accessibilityRole="link" style={styles.linkTarget}>
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
    linkTarget: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm
    },
    footerLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.md
    },
    link: {
        fontWeight: '600',
        textAlign: 'center'
    }
});
