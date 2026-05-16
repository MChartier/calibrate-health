import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { colors } from '../../src/theme';

export default function RegisterScreen() {
    const { register, serverUrl, setServerUrl } = useAuth();
    const [serverInput, setServerInput] = useState(serverUrl);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        <Screen>
            <AppText variant="title">Create account</AppText>
            <AppCard>
                <TextField label="Server" autoCapitalize="none" value={serverInput} onChangeText={setServerInput} />
                <TextField label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
                <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} />
                {error && <AppText style={styles.error}>{error}</AppText>}
                <AppButton title={isSubmitting ? 'Creating...' : 'Create account'} disabled={isSubmitting} onPress={() => void handleRegister()} />
            </AppCard>
            <Pressable>
                <Link href="/(auth)/login" asChild>
                    <AppText style={styles.link}>Back to sign in</AppText>
                </Link>
            </Pressable>
        </Screen>
    );
}

const styles = StyleSheet.create({
    error: {
        color: colors.danger
    },
    link: {
        color: colors.primary,
        fontWeight: '700',
        textAlign: 'center'
    }
});
