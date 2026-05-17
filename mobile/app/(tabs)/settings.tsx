import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ACTIVITY_LEVELS, HEIGHT_UNITS, WEIGHT_UNITS, type ActivityLevel, type HeightUnit, type Sex, type WeightUnit } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppChip } from '../../src/components/AppChip';
import { AppText } from '../../src/components/AppText';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { millimetersToCentimeters, millimetersToFeetInches } from '../../src/utils/bodyMeasurements';
import { formatCalories } from '../../src/utils/format';
import { ACTIVITY_OPTIONS, HEIGHT_UNIT_OPTIONS, SEX_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../../src/utils/profileOptions';
import { colors, spacing } from '../../src/theme';

const MIN_PASSWORD_LENGTH = 8;

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

export default function SettingsScreen() {
    const { api, user, logout, serverUrl, setServerUrl, updateCurrentUser } = useAuth();
    const queryClient = useQueryClient();
    const [serverInput, setServerInput] = useState(serverUrl);
    const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
    const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth?.slice(0, 10) ?? '');
    const [sex, setSex] = useState<Sex | null>(user?.sex ?? null);
    const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(user?.activity_level ?? ACTIVITY_LEVELS.LIGHT);
    const [heightCm, setHeightCm] = useState(() => millimetersToCentimeters(user?.height_mm));
    const initialImperialHeight = millimetersToFeetInches(user?.height_mm);
    const [heightFeet, setHeightFeet] = useState(initialImperialHeight.feet);
    const [heightInches, setHeightInches] = useState(initialImperialHeight.inches);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(user?.weight_unit ?? WEIGHT_UNITS.KG);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(user?.height_unit ?? HEIGHT_UNITS.CM);
    const [logFoodReminders, setLogFoodReminders] = useState(user?.reminder_log_food_enabled ?? true);
    const [logWeightReminders, setLogWeightReminders] = useState(user?.reminder_log_weight_enabled ?? true);
    const [hapticsEnabled, setHapticsEnabled] = useState(user?.haptics_enabled ?? true);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });

    useEffect(() => {
        if (!user) return;
        setTimezone(user.timezone);
        setDateOfBirth(user.date_of_birth?.slice(0, 10) ?? '');
        setSex(user.sex);
        setActivityLevel(user.activity_level ?? ACTIVITY_LEVELS.LIGHT);
        setHeightCm(millimetersToCentimeters(user.height_mm));
        const nextImperialHeight = millimetersToFeetInches(user.height_mm);
        setHeightFeet(nextImperialHeight.feet);
        setHeightInches(nextImperialHeight.inches);
        setWeightUnit(user.weight_unit);
        setHeightUnit(user.height_unit);
        setLogFoodReminders(user.reminder_log_food_enabled);
        setLogWeightReminders(user.reminder_log_weight_enabled);
        setHapticsEnabled(user.haptics_enabled);
    }, [user]);

    const saveProfile = useMutation({
        mutationFn: () =>
            api.updateProfile({
                timezone,
                date_of_birth: dateOfBirth || null,
                sex,
                activity_level: activityLevel,
                ...(heightUnit === HEIGHT_UNITS.CM
                    ? { height_cm: heightCm || null }
                    : { height_feet: heightFeet || null, height_inches: heightInches || '0' })
            }),
        onSuccess: async (response) => {
            updateCurrentUser(response.user);
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
        }
    });

    const savePreferences = useMutation({
        mutationFn: () =>
            api.updatePreferences({
                weight_unit: weightUnit,
                height_unit: heightUnit,
                reminder_log_food_enabled: logFoodReminders,
                reminder_log_weight_enabled: logWeightReminders,
                haptics_enabled: hapticsEnabled
            }),
        onSuccess: async (response) => {
            updateCurrentUser(response.user);
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
        }
    });

    const updateProfileImage = useMutation({
        mutationFn: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                shape: 'oval',
                quality: 0.45,
                base64: true
            });

            if (result.canceled || result.assets.length === 0) {
                return null;
            }

            const asset = result.assets[0];
            if (!asset.base64) {
                throw new Error('Selected image did not include image data.');
            }

            return api.updateProfileImage(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
        },
        onSuccess: async (response) => {
            if (!response) return;
            updateCurrentUser(response.user);
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
        }
    });

    const removeProfileImage = useMutation({
        mutationFn: () => api.deleteProfileImage(),
        onSuccess: async (response) => {
            updateCurrentUser(response.user);
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
        }
    });

    const changePassword = useMutation({
        mutationFn: () => api.changePassword({
            current_password: currentPassword,
            new_password: newPassword
        }),
        onSuccess: () => {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordError(null);
            setPasswordStatus('Password updated.');
        },
        onError: (error) => {
            setPasswordStatus(null);
            setPasswordError(error instanceof Error ? error.message : 'Unable to update password.');
        }
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
        onSuccess: async () => {
            await queryClient.invalidateQueries();
        }
    });

    async function handleSaveServer() {
        await setServerUrl(serverInput);
    }

    function handleChangePassword() {
        setPasswordStatus(null);
        if (!currentPassword) {
            setPasswordError('Enter your current password.');
            return;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }
        if (newPassword === currentPassword) {
            setPasswordError('New password must be different from your current password.');
            return;
        }

        setPasswordError(null);
        changePassword.mutate();
    }

    return (
        <Screen>
            <SectionHeader
                title="Account"
                description={user?.email ?? 'Account and app settings.'}
            />

            <AppCard>
                <SectionHeader title="Server" description="Choose the hosted service or a self-hosted backend." />
                <TextField label="Base URL" value={serverInput} onChangeText={setServerInput} autoCapitalize="none" />
                <AppButton
                    title="Save server URL"
                    variant="secondary"
                    leftIcon={<Ionicons name="server-outline" size={18} color={colors.text} />}
                    onPress={() => void handleSaveServer()}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="Profile photo" description="Used for your avatar across the app." />
                <View style={styles.avatarRow}>
                    <View style={styles.avatar}>
                        {user?.profile_image_url ? (
                            <Image source={{ uri: user.profile_image_url }} style={styles.avatarImage} />
                        ) : (
                            <AppText variant="subtitle" style={styles.avatarLabel}>{getAvatarLabel(user?.email)}</AppText>
                        )}
                    </View>
                    <View style={styles.avatarActions}>
                        <AppButton
                            title={updateProfileImage.isPending ? 'Opening...' : 'Choose photo'}
                            variant="secondary"
                            disabled={updateProfileImage.isPending || removeProfileImage.isPending}
                            leftIcon={<Ionicons name="image-outline" size={18} color={colors.text} />}
                            onPress={() => updateProfileImage.mutate()}
                        />
                        {user?.profile_image_url && (
                            <AppButton
                                title={removeProfileImage.isPending ? 'Removing...' : 'Remove photo'}
                                variant="ghost"
                                disabled={updateProfileImage.isPending || removeProfileImage.isPending}
                                leftIcon={<Ionicons name="trash-outline" size={18} color={colors.text} />}
                                onPress={() => removeProfileImage.mutate()}
                            />
                        )}
                    </View>
                </View>
                {(updateProfileImage.error || removeProfileImage.error) && (
                    <AppText style={styles.error}>
                        {updateProfileImage.error?.message ?? removeProfileImage.error?.message}
                    </AppText>
                )}
            </AppCard>

            <AppCard>
                <SectionHeader title="Profile" description="Timezone and body details used for calorie targets." />
                <TextField label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
                <TextField label="Date of birth" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                <AppText variant="label">Sex</AppText>
                <View style={styles.chips}>
                    {SEX_OPTIONS.map((option) => (
                        <AppChip
                            key={option.value}
                            label={option.label}
                            selected={sex === option.value}
                            onPress={() => setSex(option.value)}
                        />
                    ))}
                </View>
                <AppText variant="label">Activity level</AppText>
                <View style={styles.chips}>
                    {ACTIVITY_OPTIONS.map((option) => (
                        <AppChip
                            key={option.value}
                            label={option.label}
                            selected={activityLevel === option.value}
                            onPress={() => setActivityLevel(option.value)}
                        />
                    ))}
                </View>
                {heightUnit === HEIGHT_UNITS.CM ? (
                    <NumberStepperField label="Height" value={heightCm} onChangeText={setHeightCm} step={1} min={0} suffix="cm" />
                ) : (
                    <View style={styles.row}>
                        <NumberStepperField label="Feet" value={heightFeet} onChangeText={setHeightFeet} step={1} min={0} containerStyle={styles.rowButton} />
                        <NumberStepperField label="Inches" value={heightInches} onChangeText={setHeightInches} step={1} min={0} max={11} containerStyle={styles.rowButton} />
                    </View>
                )}
                <AppText variant="muted">Current calorie target: {formatCalories(profileQuery.data?.calorieSummary.dailyCalorieTarget)}</AppText>
                {saveProfile.error && <AppText style={styles.error}>{saveProfile.error.message}</AppText>}
                <AppButton
                    title={saveProfile.isPending ? 'Saving...' : 'Save profile'}
                    disabled={saveProfile.isPending}
                    leftIcon={<Ionicons name="person-outline" size={18} color="#ffffff" />}
                    onPress={() => saveProfile.mutate()}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="Password" description="Update the password for this account." />
                <TextField label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
                <TextField label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
                <TextField label="Confirm new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
                {passwordError && <AppText style={styles.error}>{passwordError}</AppText>}
                {passwordStatus && <AppText style={styles.success}>{passwordStatus}</AppText>}
                <AppButton
                    title={changePassword.isPending ? 'Updating...' : 'Update password'}
                    disabled={changePassword.isPending}
                    variant="secondary"
                    leftIcon={<Ionicons name="key-outline" size={18} color={colors.text} />}
                    onPress={handleChangePassword}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="Preferences" description="Units, reminders, and interaction feedback." />
                <AppText variant="label">Weight unit</AppText>
                <SegmentedControl options={WEIGHT_UNIT_OPTIONS} value={weightUnit} onChange={setWeightUnit} />
                <AppText variant="label">Height unit</AppText>
                <SegmentedControl options={HEIGHT_UNIT_OPTIONS} value={heightUnit} onChange={setHeightUnit} />
                <PreferenceSwitch
                    label="Food reminders"
                    value={logFoodReminders}
                    onValueChange={setLogFoodReminders}
                />
                <PreferenceSwitch
                    label="Weight reminders"
                    value={logWeightReminders}
                    onValueChange={setLogWeightReminders}
                />
                <PreferenceSwitch
                    label="Haptics"
                    value={hapticsEnabled}
                    onValueChange={setHapticsEnabled}
                />
                {savePreferences.error && <AppText style={styles.error}>{savePreferences.error.message}</AppText>}
                <AppButton
                    title={savePreferences.isPending ? 'Saving...' : 'Save preferences'}
                    disabled={savePreferences.isPending}
                    variant="secondary"
                    leftIcon={<Ionicons name="options-outline" size={18} color={colors.text} />}
                    onPress={() => savePreferences.mutate()}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="Import" description="Import a Lose It ZIP export into food logs and weigh-ins." />
                {importMutation.data && (
                    <AppText variant="muted">
                        Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                    </AppText>
                )}
                {importMutation.error && <AppText style={styles.error}>{importMutation.error.message}</AppText>}
                <AppButton
                    title={importMutation.isPending ? 'Importing...' : 'Import Lose It ZIP'}
                    variant="secondary"
                    leftIcon={<Ionicons name="cloud-upload-outline" size={18} color={colors.text} />}
                    onPress={() => importMutation.mutate()}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="WearOS readiness" description="The first release ships phone UI only." />
                <AppText variant="muted">Native bearer sessions and device identifiers are in place so a future watch app can pair and sync without changing the core data model.</AppText>
            </AppCard>

            <AppButton
                title="Log out"
                variant="danger"
                leftIcon={<Ionicons name="log-out-outline" size={18} color="#ffffff" />}
                onPress={() => void logout()}
            />
        </Screen>
    );
}

type PreferenceSwitchProps = {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
};

const PreferenceSwitch: React.FC<PreferenceSwitchProps> = ({ label, value, onValueChange }) => (
    <View style={styles.switchRow}>
        <AppText variant="body">{label}</AppText>
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={value ? colors.primary : colors.muted}
        />
    </View>
);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg
    },
    avatar: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden'
    },
    avatarImage: {
        width: '100%',
        height: '100%'
    },
    avatarLabel: {
        color: colors.primaryDark
    },
    avatarActions: {
        flex: 1,
        gap: spacing.sm
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    switchRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    success: {
        color: colors.success
    },
    error: {
        color: colors.danger
    }
});
