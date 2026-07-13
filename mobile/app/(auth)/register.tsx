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
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { colors, spacing } from '../../src/theme';

export default function RegisterScreen() {
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const { register, serverUrl, setServerUrl, testServerUrl, serverConnection, authError } = useAuth();
    const routedServerDraft = readAuthServerDraft(params.serverUrl);
    const [serverInput, setServerInput] = useState(routedServerDraft ?? serverUrl);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setServerInput(routedServerDraft ?? serverUrl);
    }, [routedServerDraft, serverUrl]);

    async function handleRegister() {
        setIsSubmitting(true);
        setError(null);
        try {
            const changedServer = await setServerUrl(serverInput);
            if (!changedServer) return;
            await register(email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to create account.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Screen style={styles.screen}>
            <View style={styles.header}>
                <AppText variant="title">calibrate</AppText>
                <AppText variant="muted">Create an account on the hosted service or your self-hosted Calibrate server.</AppText>
            </View>

            <AppCard>
                <SectionHeader title="Create account" description="Use email and password for this Calibrate server." />
                <TextField
                    label="Email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />
                <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} />
                <ServerUrlControl
                    value={serverInput}
                    onChangeText={setServerInput}
                    connection={serverConnection}
                    onTestConnection={testServerUrl}
                />
                {(error || authError) && <AppText style={styles.error}>{error ?? authError}</AppText>}
                <AppButton title={isSubmitting ? 'Creating...' : 'Create account'} disabled={isSubmitting} onPress={() => void handleRegister()} />
            </AppCard>

            <Link
                href={{ pathname: '/(auth)/login', params: { serverUrl: serverInput } }}
                asChild
            >
                <Pressable accessibilityRole="link">
                    <AppText style={styles.link}>Back to sign in</AppText>
                </Pressable>
            </Link>
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
    link: {
        color: colors.primary,
        fontWeight: '800',
        textAlign: 'center'
    }
});
