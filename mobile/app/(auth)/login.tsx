import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { ServerUrlControl } from '../../src/components/ServerUrlControl';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, spacing } from '../../src/theme';

export default function LoginScreen() {
    const { login, serverUrl, setServerUrl, testServerUrl, serverConnection, authError } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [serverInput, setServerInput] = useState(serverUrl);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setServerInput(serverUrl);
    }, [serverUrl]);

    async function handleLogin() {
        setIsSubmitting(true);
        setError(null);
        try {
            const changedServer = await setServerUrl(serverInput);
            if (!changedServer) return;
            await login(email, password);
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
                <AppButton title={isSubmitting ? 'Signing in...' : 'Sign in'} disabled={isSubmitting} onPress={() => void handleLogin()} />
            </AppCard>

            <Pressable>
                <Link href="/(auth)/register" asChild>
                    <AppText style={styles.link}>Create an account</AppText>
                </Link>
            </Pressable>
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
        fontWeight: '700',
        textAlign: 'center'
    }
});
