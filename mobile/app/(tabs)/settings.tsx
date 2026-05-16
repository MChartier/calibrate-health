import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, spacing } from '../../src/theme';

export default function SettingsScreen() {
    const { api, user, logout, serverUrl, setServerUrl } = useAuth();
    const queryClient = useQueryClient();
    const [serverInput, setServerInput] = useState(serverUrl);
    const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
    const [heightMm, setHeightMm] = useState(user?.height_mm ? String(user.height_mm) : '');
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const saveProfile = useMutation({
        mutationFn: () =>
            api.updateProfile({
                timezone,
                height_mm: heightMm ? Number(heightMm) : undefined
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
    });
    const importMutation = useMutation({
        mutationFn: async () => {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/zip',
                copyToCacheDirectory: true
            });
            if (result.canceled || result.assets.length === 0) return null;
            const asset = result.assets[0];
            return api.executeLoseItImport({
                uri: asset.uri,
                name: asset.name ?? 'loseit-export.zip',
                type: asset.mimeType ?? 'application/zip'
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries();
        }
    });

    async function handleSaveServer() {
        await setServerUrl(serverInput);
    }

    return (
        <Screen>
            <View>
                <AppText variant="title">Settings</AppText>
                <AppText variant="muted">{user?.email}</AppText>
            </View>

            <AppCard>
                <AppText variant="subtitle">Server</AppText>
                <TextField label="Base URL" value={serverInput} onChangeText={setServerInput} autoCapitalize="none" />
                <AppButton title="Save server URL" variant="secondary" onPress={() => void handleSaveServer()} />
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">Profile</AppText>
                <TextField label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
                <TextField label="Height (mm)" value={heightMm} onChangeText={setHeightMm} keyboardType="number-pad" />
                <AppText variant="muted">Current calorie target: {profileQuery.data?.calorieSummary.dailyCalorieTarget ?? '-'}</AppText>
                {saveProfile.error && <AppText style={styles.error}>{saveProfile.error.message}</AppText>}
                <AppButton title={saveProfile.isPending ? 'Saving...' : 'Save profile'} onPress={() => saveProfile.mutate()} />
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">Import</AppText>
                <AppText variant="muted">Import a Lose It ZIP export into food logs and weigh-ins.</AppText>
                {importMutation.data && (
                    <AppText variant="muted">
                        Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                    </AppText>
                )}
                <AppButton title={importMutation.isPending ? 'Importing...' : 'Import Lose It ZIP'} variant="secondary" onPress={() => importMutation.mutate()} />
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">WearOS readiness</AppText>
                <AppText variant="muted">This phone app uses native bearer sessions and device identifiers so a future WearOS companion can pair cleanly without changing the core API model.</AppText>
            </AppCard>

            <AppButton title="Log out" variant="danger" onPress={() => void logout()} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    error: {
        color: colors.danger
    },
    row: {
        flexDirection: 'row',
        gap: spacing.md
    }
});
