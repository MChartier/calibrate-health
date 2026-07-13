import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { ServerUrlControl } from '../../src/components/ServerUrlControl';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { accountDeletionCleanupGuidance } from '../../src/account/accountDeletionNotice';
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { colors, spacing } from '../../src/theme';

export default function LoginScreen() {
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
        <Screen style={styles.screen}>
            <View style={styles.header}>
                <AppText variant="title">calibrate</AppText>
                <AppText variant="muted">Fast daily logging with the same food, weight, and goal data as the web app.</AppText>
            </View>

            {accountDeletionCleanupNotice && (
                <AppCard accessibilityLiveRegion="polite" style={styles.cleanupNotice}>
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
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />
                <TextField
                    label="Password"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />
                <ServerUrlControl
                    value={serverInput}
                    onChangeText={setServerInput}
                    connection={serverConnection}
                    onTestConnection={testServerUrl}
                />
                {(error || authError) && <AppText style={styles.error}>{error ?? authError}</AppText>}
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
                    <Pressable accessibilityRole="link">
                        <AppText style={styles.link}>Create an account</AppText>
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
    header: {
        gap: spacing.sm
    },
    error: {
        color: colors.danger
    },
    cleanupNotice: {
        borderColor: colors.warning
    },
    link: {
        color: colors.primary,
        fontWeight: '700',
        textAlign: 'center'
    }
});
