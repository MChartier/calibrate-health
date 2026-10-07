import { useRef, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { AppButton } from '../src/components/AppButton';
import { AppText } from '../src/components/AppText';
import { TextField } from '../src/components/TextField';
import { TrustPageShell, trustPageStyles } from '../src/components/auth/TrustPageShell';
import { CalibrateApiClient } from '@calibrate/api-client';
import { normalizeServerUrl } from '../src/config/server';
import { readAuthServerDraft } from '../src/auth/authServerDraft';
import { MOBILE_CLIENT_IDENTITY } from '../src/config/nativeClient';
import { useAuth } from '../src/auth/AuthContext';
import { getAccountTrustErrorMessage } from '../src/errors/presentation';
import { useAppTheme } from '../src/theme';

const GENERIC_RESET_MESSAGE = 'If an eligible account matches that email, reset instructions will arrive shortly.';

export default function ForgotPasswordRoute() {
    const { api, serverUrl, testServerUrl } = useAuth();
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const selectedServer = Platform.OS === 'web' ? serverUrl : readAuthServerDraft(params.serverUrl) ?? serverUrl;
    const submittingRef = useRef(false);
    const { colors } = useAppTheme();
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function requestReset() {
        if (submittingRef.current) return;
        if (!email.trim()) {
            setEmailError('Enter your email address.');
            return;
        }
        setEmailError(null);
        setError(null);
        setMessage(null);
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            if (!await testServerUrl(selectedServer)) {
                setError('Could not confirm this service. Check its address from sign in and try again.');
                return;
            }
            const normalized = normalizeServerUrl(selectedServer);
            if (!normalized) return;
            // Native recovery follows the selected sign-in destination, never the prior saved host.
            const client = Platform.OS === 'web' ? api : new CalibrateApiClient({
                baseUrl: normalized,
                clientIdentity: MOBILE_CLIENT_IDENTITY
            });
            await client.requestPasswordReset({ email: email.trim() });
            setMessage(GENERIC_RESET_MESSAGE);
        } catch (requestError) {
            setError(getAccountTrustErrorMessage(requestError, 'Unable to request a password reset. Try again.'));
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <TrustPageShell
            title="Reset password"
            description="Enter your account email. For privacy, the response is the same whether or not an account exists."
            footer={(
                <Link href={Platform.OS === 'web' ? '/(auth)/login' : { pathname: '/(auth)/login', params: { serverUrl: selectedServer } }} asChild>
                    <Pressable accessibilityRole="link" style={trustPageStyles.linkTarget}>
                        <AppText style={{ color: colors.primary, fontWeight: '600' }}>Back to sign in</AppText>
                    </Pressable>
                </Link>
            )}
        >
            <AppText variant="caption" selectable>Account service: {selectedServer}</AppText>
            <TextField
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                errorText={emailError ?? undefined}
                focusError={Boolean(emailError)}
                onChangeText={(value) => {
                    setEmail(value);
                    if (emailError) setEmailError(null);
                }}
                onSubmitEditing={() => void requestReset()}
            />
            {message && <AppText accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</AppText>}
            {error && <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</AppText>}
            <AppButton
                title="Send reset instructions"
                busy={isSubmitting}
                busyLabel="Sending..."
                onPress={() => void requestReset()}
            />
        </TrustPageShell>
    );
}
