import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { AuthBrand } from '../../src/components/auth/AuthBrand';
import { Screen } from '../../src/components/Screen';
import { ServerUrlControl } from '../../src/components/ServerUrlControl';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { accountDeletionCleanupGuidance } from '../../src/account/accountDeletionNotice';
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { useAppTheme } from '../../src/theme';

export default function LoginScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const {
        login, serverUrl, testServerUrl, serverConnection, authError,
        accountDeletionCleanupNotice, acknowledgeAccountDeletionCleanupNotice
    } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const routedServerDraft = readAuthServerDraft(params.serverUrl);
    const [serverInput, setServerInput] = useState(routedServerDraft ?? serverUrl);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setServerInput(routedServerDraft ?? serverUrl);
    }, [routedServerDraft, serverUrl]);

    async function handleLogin() {
        if (accountDeletionCleanupNotice) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await login(email, password, serverInput);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to sign in.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Screen safeTop style={styles.screen}>
            <AuthBrand description="Track food, weight, and progress with your data on your server." />

            {accountDeletionCleanupNotice && (
                <AppCard accessibilityLiveRegion="polite" style={[styles.cleanupNotice, { borderColor: colors.warning }]}>
                    <SectionHeader
                        title="Account deleted - device cleanup needed"
                        description={accountDeletionCleanupGuidance(accountDeletionCleanupNotice)}
                    />
                    <AppButton
                        title="I completed these steps"
                        variant="secondary"
                        onPress={() => void acknowledgeAccountDeletionCleanupNotice()}
                    />
                </AppCard>
            )}

            <AppCard>
                <SectionHeader title="Sign in" description="Use your Calibrate account." />
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
                <ServerUrlControl
                    value={serverInput}
                    onChangeText={setServerInput}
                    connection={serverConnection}
                    onTestConnection={testServerUrl}
                />
                {(error || authError) && <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error ?? authError}</AppText>}
                <AppButton
                    title={isSubmitting ? 'Signing in...' : 'Sign in'}
                    disabled={isSubmitting || Boolean(accountDeletionCleanupNotice)}
                    onPress={() => void handleLogin()}
                />
            </AppCard>

            {!accountDeletionCleanupNotice && (
                <Link
                    href={{ pathname: '/(auth)/register', params: { serverUrl: serverInput } }}
                    asChild
                >
                    <Pressable accessibilityRole="link" style={styles.linkTarget}>
                        <AppText style={[styles.link, { color: colors.primary }]}>Create an account</AppText>
                    </Pressable>
                </Link>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        justifyContent: 'center',
        flexGrow: 1,
        maxWidth: 520,
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
    link: {
        fontWeight: '700',
        textAlign: 'center'
    }
});
