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
import { readAuthServerDraft } from '../../src/auth/authServerDraft';
import { useAppTheme } from '../../src/theme';

export default function RegisterScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{ serverUrl?: string | string[] }>();
    const { register, serverUrl, testServerUrl, serverConnection, authError } = useAuth();
    const routedServerDraft = readAuthServerDraft(params.serverUrl);
    const [serverInput, setServerInput] = useState(routedServerDraft ?? serverUrl);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setServerInput(routedServerDraft ?? serverUrl);
    }, [routedServerDraft, serverUrl]);

    async function handleRegister() {
        if (!email.trim()) {
            setError('Enter your email address.');
            return;
        }
        if (!password) {
            setError('Enter a password.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            await register(email, password, serverInput);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to create account.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Screen safeTop style={styles.screen}>
            <AuthBrand description="A private, portable home for your food, weight, and goal history." />

            <AppCard>
                <SectionHeader title="Create account" description="Use email and password for this Calibrate server." />
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
                <ServerUrlControl
                    value={serverInput}
                    onChangeText={setServerInput}
                    connection={serverConnection}
                    onTestConnection={testServerUrl}
                />
                {(error || authError) && <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error ?? authError}</AppText>}
                <AppButton title={isSubmitting ? 'Creating...' : 'Create account'} disabled={isSubmitting} onPress={() => void handleRegister()} />
            </AppCard>

            <Link
                href={{ pathname: '/(auth)/login', params: { serverUrl: serverInput } }}
                asChild
            >
                <Pressable accessibilityRole="link" style={styles.linkTarget}>
                    <AppText style={[styles.link, { color: colors.primary }]}>Back to sign in</AppText>
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
    linkTarget: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center'
    },
    link: {
        fontWeight: '800',
        textAlign: 'center'
    }
});
