import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVITY_LEVELS, HEIGHT_UNITS, WEIGHT_UNITS, type ActivityLevel, type HeightUnit, type Sex, type WeightUnit } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppChip } from '../../src/components/AppChip';
import { AppText } from '../../src/components/AppText';
import { HealthConnectCard } from '../../src/components/HealthConnectCard';
import { WearPairingCard } from '../../src/components/WearPairingCard';
import { BottomSheetModal } from '../../src/components/BottomSheetModal';
import { DatePickerField } from '../../src/components/DatePickerField';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { TextField } from '../../src/components/TextField';
import { TimeZonePickerField } from '../../src/components/TimeZonePickerField';
import { SettingsRow, SettingsSection } from '../../src/components/settings/SettingsList';
import { useAuth } from '../../src/auth/AuthContext';
import {
    canSubmitAccountDeletion,
    deleteAccountAndClearLocalData,
    DELETE_ACCOUNT_CONFIRMATION,
    shareAccountExport
} from '../../src/account/accountData';
import { OUTBOX_MUTATION_STATES } from '../../src/offline/queuedMutation';
import { useOfflineOutbox } from '../../src/offline/provider';
import { useNativePushRegistration } from '../../src/hooks/useNativePushRegistration';
import { getPushStatusPresentation } from '../../src/notifications/workflow';
import { millimetersToCentimeters, millimetersToFeetInches } from '../../src/utils/bodyMeasurements';
import { getTodayDate } from '../../src/utils/dates';
import { formatCalories } from '../../src/utils/format';
import { formatGoalSummary } from '../../src/utils/goals';
import { ACTIVITY_OPTIONS, HEIGHT_UNIT_OPTIONS, SEX_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../../src/utils/profileOptions';
import { radius, spacing, useAppTheme } from '../../src/theme';
import { useHealthConnect } from '../../src/healthConnect/provider';
import { clearWearAccountData } from '../../src/wear/accountCleanup';
import { MOBILE_CLIENT_IDENTITY } from '../../src/config/nativeClient';

const MIN_PASSWORD_LENGTH = 8;
type SettingsSheet =
    | 'preferences'
    | 'health-connect'
    | 'watch'
    | 'import'
    | 'profile-photo'
    | 'password'
    | 'devices'
    | 'offline'
    | 'data'
    | 'server'
    | null;

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

function formatSessionActivity(value: string | null, fallback: string): string {
    const timestamp = value ?? fallback;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? 'Unknown activity' : `Active ${parsed.toLocaleDateString()}`;
}

export default function SettingsScreen() {
    const router = useRouter();
    const {
        api, user, clearLocalSession, logout, persistAccountDeletionCleanupNotice,
        serverUrl, setServerUrl, updateCurrentUser
    } = useAuth();
    const {
        isReady: isOutboxReady,
        initializationError: outboxInitializationError,
        mutations: queuedMutations,
        discardAll: discardOfflineChanges,
        reconcile: reconcileOutbox,
        retryFailed: retryFailedOutbox
    } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const { colors: themeColors } = useAppTheme();
    const healthConnect = useHealthConnect();
    const nativePush = useNativePushRegistration();
    const isWeb = Platform.OS === 'web';
    const pushStatus = getPushStatusPresentation(nativePush.state, isWeb ? 'web' : 'android');
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
    const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
    const [activeSheet, setActiveSheet] = useState<SettingsSheet>(null);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
    const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const goalQuery = useQuery({ queryKey: ['mobile-goal'], queryFn: () => api.getGoals() });
    const sessionsQuery = useQuery({
        queryKey: ['mobile-sessions'],
        queryFn: () => api.getMobileSessions()
    });
    const pendingMutationCount = queuedMutations.filter(
        ({ state }) => state === OUTBOX_MUTATION_STATES.PENDING || state === OUTBOX_MUTATION_STATES.REPLAYING
    ).length;
    const failedMutations = queuedMutations.filter(({ state }) => state === OUTBOX_MUTATION_STATES.FAILED);
    const syncOutbox = useMutation({ mutationFn: () => reconcileOutbox() });
    const retryOutbox = useMutation({ mutationFn: () => retryFailedOutbox() });
    const outboxActionError = syncOutbox.error ?? retryOutbox.error;
    let outboxErrorMessage = outboxInitializationError;
    if (!outboxErrorMessage && outboxActionError) {
        outboxErrorMessage = outboxActionError instanceof Error
            ? outboxActionError.message
            : 'Unable to sync offline changes.';
    }
    const exportAccount = useMutation({
        mutationFn: async () => {
            const accountExport = await api.exportAccount();
            await shareAccountExport(accountExport);
        }
    });
    const deleteAccount = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error('Sign in again before deleting this account.');
            const accountUserId = user.id;
            const accountServerUrl = serverUrl;
            await deleteAccountAndClearLocalData(deleteAccountPassword, {
                deleteRemoteAccount: (currentPassword) => api.deleteAccount(currentPassword),
                discardOfflineChanges,
                clearHealthConnectData: healthConnect.clearAccountData,
                clearWearData: () => clearWearAccountData(accountServerUrl, accountUserId),
                persistCleanupNotice: persistAccountDeletionCleanupNotice,
                clearLocalSession
            });
            setDeleteAccountPassword('');
            setDeleteAccountConfirmation('');
        }
    });

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
            setIsProfileEditorOpen(false);
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
            setActiveSheet(null);
        }
    });

    const updateProfileImage = useMutation({
        mutationFn: async () => {
            const ImagePicker = await import('expo-image-picker');
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

    const revokeSession = useMutation({
        mutationFn: (sessionId: number) => api.revokeMobileSession(sessionId),
        onSuccess: async (_response, sessionId) => {
            const revokedCurrentSession = sessionsQuery.data?.sessions.some(
                (session) => session.id === sessionId && session.current
            );
            if (revokedCurrentSession) {
                await logout();
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ['mobile-sessions'] });
        }
    });

    const revokeOtherSessions = useMutation({
        mutationFn: () => api.revokeOtherMobileSessions(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['mobile-sessions'] });
        }
    });

    const importMutation = useMutation({
        mutationFn: async () => {
            const DocumentPicker = await import('expo-document-picker');
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
        setActiveSheet(null);
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

    function confirmDeleteAccount() {
        if (!canSubmitAccountDeletion(deleteAccountPassword, deleteAccountConfirmation)) return;
        Alert.alert(
            'Permanently delete account?',
            'This permanently deletes your profile, food logs, weigh-ins, goals, saved foods, and device sessions.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete forever',
                    style: 'destructive',
                    onPress: () => deleteAccount.mutate()
                }
            ]
        );
    }

    return (
        <Screen reserveBottomTabs style={{ backgroundColor: themeColors.background }}>
            <AppCard style={{ backgroundColor: themeColors.surface, borderColor: themeColors.outlineVariant }}>
                <View style={styles.accountSummary}>
                    <View style={[styles.summaryAvatar, { backgroundColor: themeColors.primaryContainer }]}>
                        {user?.profile_image_url ? (
                            <Image source={{ uri: user.profile_image_url }} style={styles.avatarImage} />
                        ) : (
                            <AppText variant="subtitle" style={{ color: themeColors.onPrimaryContainer }}>{getAvatarLabel(user?.email)}</AppText>
                        )}
                    </View>
                    <View style={styles.summaryText}>
                        <AppText
                            accessibilityRole="header"
                            aria-level={2}
                            ellipsizeMode="middle"
                            numberOfLines={1}
                            style={styles.summaryEmail}
                        >
                            {user?.email ?? 'Calibrate account'}
                        </AppText>
                        <AppText variant="caption" numberOfLines={2}>
                            {goalQuery.isLoading
                                ? 'Loading current goal...'
                                : formatGoalSummary(goalQuery.data, user?.weight_unit)}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <SettingsSection title="Personal" description="Your profile and how Calibrate works for you.">
                <SettingsRow
                    icon="person-outline"
                    label="Profile details"
                    supportingText="Body details, activity level, and time zone"
                    onPress={() => setIsProfileEditorOpen(true)}
                />
                <SettingsRow
                    icon="options-outline"
                    label="Preferences"
                    supportingText="Units, reminders, notifications, and haptics"
                    value={`${weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg'} | ${heightUnit === HEIGHT_UNITS.FT_IN ? 'ft/in' : 'cm'}`}
                    onPress={() => setActiveSheet('preferences')}
                />
                <SettingsRow
                    icon="image-outline"
                    label="Profile photo"
                    supportingText="Your avatar across Calibrate"
                    showDivider={false}
                    onPress={() => setActiveSheet('profile-photo')}
                />
            </SettingsSection>

            <SettingsSection title="Connections" description="Health data and companion devices.">
                <SettingsRow
                    icon="fitness-outline"
                    label="Health Connect"
                    supportingText="Read activity and weight from Android"
                    onPress={() => setActiveSheet('health-connect')}
                />
                <SettingsRow
                    icon="watch-outline"
                    label="Galaxy Watch"
                    supportingText="Pair, sync, and manage the Wear OS companion"
                    onPress={() => setActiveSheet('watch')}
                />
                <SettingsRow
                    icon="phone-portrait-outline"
                    label="Signed-in devices"
                    supportingText="Review and revoke phone and watch sessions"
                    value={sessionsQuery.data ? String(sessionsQuery.data.sessions.length) : undefined}
                    showDivider={false}
                    onPress={() => setActiveSheet('devices')}
                />
            </SettingsSection>

            <SettingsSection title="Data" description="Import, sync, export, and privacy controls.">
                <SettingsRow
                    icon="cloud-upload-outline"
                    label="Import from Lose It"
                    supportingText="Bring in a ZIP export"
                    onPress={() => setActiveSheet('import')}
                />
                <SettingsRow
                    icon="sync-outline"
                    label="Offline changes"
                    supportingText={isOutboxReady
                        ? 'Review work waiting to sync'
                        : 'Browser changes require an active server connection'}
                    value={isOutboxReady
                        ? (failedMutations.length > 0 ? `${failedMutations.length} failed` : `${pendingMutationCount} pending`)
                        : 'Online only'}
                    onPress={() => setActiveSheet('offline')}
                />
                <SettingsRow
                    icon="shield-checkmark-outline"
                    label="Your data"
                    supportingText="Export or permanently delete your account"
                    showDivider={false}
                    onPress={() => setActiveSheet('data')}
                />
            </SettingsSection>

            <SettingsSection title="Security & server">
                <SettingsRow
                    icon="key-outline"
                    label="Password"
                    supportingText="Change your account password"
                    onPress={() => setActiveSheet('password')}
                />
                <SettingsRow
                    icon="server-outline"
                    label="Calibrate server"
                    supportingText="Hosted or self-hosted connection"
                    value={serverUrl.replace(/^https?:\/\//, '')}
                    showDivider={false}
                    onPress={() => setActiveSheet('server')}
                />
            </SettingsSection>

            <SettingsSection title="App">
                <SettingsRow
                    icon="information-circle-outline"
                    label="About Calibrate"
                    supportingText="Version, build, and software updates"
                    value={isWeb ? undefined : `v${MOBILE_CLIENT_IDENTITY.version}`}
                    showDivider={false}
                    onPress={() => router.push('/about')}
                />
            </SettingsSection>

            <SettingsSection title="Account">
                <SettingsRow
                    icon="log-out-outline"
                    label="Log out"
                    danger
                    showDivider={false}
                    onPress={() => void logout()}
                />
            </SettingsSection>

            <SettingsDetailSheet
                visible={activeSheet === 'preferences'}
                maxHeight="92%"
                onClose={() => setActiveSheet(null)}
            >
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
                <View style={styles.notificationStatus}>
                    <AppText variant="label">{isWeb ? 'Push in this browser' : 'Push on this device'}</AppText>
                    <AppText
                        accessibilityLiveRegion="polite"
                        accessibilityRole={pushStatus.isError ? 'alert' : undefined}
                        style={pushStatus.isError ? [styles.error, { color: themeColors.danger }] : undefined}
                        variant={pushStatus.isError ? 'body' : 'muted'}
                    >
                        {pushStatus.message}
                    </AppText>
                    {pushStatus.action === 'request' && (
                        <AppButton
                            title="Enable push notifications"
                            variant="secondary"
                            accessibilityHint={isWeb
                                ? 'Shows this browser notification permission prompt.'
                                : 'Shows the Android notification permission prompt.'}
                            leftIcon={<Ionicons name="notifications-outline" size={18} color={themeColors.onSurface} />}
                            onPress={() => void nativePush.requestPermission()}
                        />
                    )}
                    {pushStatus.action === 'settings' && (
                        <View style={styles.row}>
                            {!isWeb && (
                                <AppButton
                                    title="Open Android settings"
                                    variant="secondary"
                                    accessibilityHint="Opens notification permissions for Calibrate."
                                    onPress={() => void nativePush.openSettings()}
                                    style={styles.rowButton}
                                />
                            )}
                            <AppButton
                                title="Check again"
                                variant="secondary"
                                accessibilityHint={isWeb
                                    ? 'Checks whether notifications are now allowed for this site.'
                                    : 'Checks whether notification permission is now enabled.'}
                                onPress={() => void nativePush.refreshPermission()}
                                style={styles.rowButton}
                            />
                        </View>
                    )}
                    {pushStatus.action === 'retry' && (
                        <AppButton
                            title="Retry push registration"
                            variant="secondary"
                            accessibilityHint={isWeb
                                ? 'Checks permission and registers this browser again.'
                                : 'Checks permission and registers this device again.'}
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={themeColors.onSurface} />}
                            onPress={() => void nativePush.retryRegistration()}
                        />
                    )}
                    {pushStatus.action === 'disable' && isWeb && (
                        <AppButton
                            title="Disable push in this browser"
                            variant="secondary"
                            accessibilityHint="Removes this browser from reminder delivery on the selected Calibrate server."
                            leftIcon={<Ionicons name="notifications-off-outline" size={18} color={themeColors.onSurface} />}
                            onPress={() => void nativePush.disableRegistration?.()}
                        />
                    )}
                </View>
                <PreferenceSwitch
                    label="Haptics"
                    value={hapticsEnabled}
                    onValueChange={setHapticsEnabled}
                />
                {savePreferences.error && <AppText style={[styles.error, { color: themeColors.danger }]}>{savePreferences.error.message}</AppText>}
                <AppButton
                    title={savePreferences.isPending ? 'Saving...' : 'Save preferences'}
                    disabled={savePreferences.isPending}
                    leftIcon={<Ionicons name="options-outline" size={18} color={themeColors.onPrimary} />}
                    onPress={() => savePreferences.mutate()}
                />
            </SettingsDetailSheet>

            <BottomSheetModal
                visible={activeSheet === 'health-connect'}
                maxHeight="92%"
                onRequestClose={() => setActiveSheet(null)}
            >
                <HealthConnectCard />
            </BottomSheetModal>
            <BottomSheetModal
                visible={activeSheet === 'watch'}
                maxHeight="92%"
                onRequestClose={() => setActiveSheet(null)}
            >
                <WearPairingCard />
            </BottomSheetModal>

            <SettingsDetailSheet
                visible={activeSheet === 'import'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader title="Import" description="Import a Lose It ZIP export into food logs and weigh-ins." />
                {importMutation.data && (
                    <AppText variant="muted">
                        Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                    </AppText>
                )}
                {importMutation.error && <AppText style={[styles.error, { color: themeColors.danger }]}>{importMutation.error.message}</AppText>}
                <AppButton
                    title={importMutation.isPending ? 'Importing...' : 'Import Lose It ZIP'}
                    variant="secondary"
                    leftIcon={<Ionicons name="cloud-upload-outline" size={18} color={themeColors.onSurface} />}
                    onPress={() => importMutation.mutate()}
                />
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'profile-photo'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader
                    title="Profile photo"
                    description={user?.email ? `Signed in as ${user.email}.` : 'Used for your avatar across the app.'}
                />
                <View style={styles.avatarRow}>
                    <View style={[
                        styles.avatar,
                        { backgroundColor: themeColors.primaryContainer, borderColor: themeColors.outlineVariant }
                    ]}>
                        {user?.profile_image_url ? (
                            <Image source={{ uri: user.profile_image_url }} style={styles.avatarImage} />
                        ) : (
                            <AppText variant="subtitle" style={{ color: themeColors.onPrimaryContainer }}>
                                {getAvatarLabel(user?.email)}
                            </AppText>
                        )}
                    </View>
                    <View style={styles.avatarActions}>
                        <AppButton
                            title={updateProfileImage.isPending ? 'Opening...' : 'Choose photo'}
                            variant="secondary"
                            disabled={updateProfileImage.isPending || removeProfileImage.isPending}
                            leftIcon={<Ionicons name="image-outline" size={18} color={themeColors.onSurface} />}
                            onPress={() => updateProfileImage.mutate()}
                        />
                        {user?.profile_image_url && (
                            <AppButton
                                title={removeProfileImage.isPending ? 'Removing...' : 'Remove photo'}
                                variant="ghost"
                                disabled={updateProfileImage.isPending || removeProfileImage.isPending}
                                leftIcon={<Ionicons name="trash-outline" size={18} color={themeColors.onSurface} />}
                                onPress={() => removeProfileImage.mutate()}
                            />
                        )}
                    </View>
                </View>
                {(updateProfileImage.error || removeProfileImage.error) && (
                    <AppText style={[styles.error, { color: themeColors.danger }]}>
                        {updateProfileImage.error?.message ?? removeProfileImage.error?.message}
                    </AppText>
                )}
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'password'}
                maxHeight="92%"
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader title="Password" description="Update the password for this account." />
                <TextField label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
                <TextField label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
                <TextField label="Confirm new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
                {passwordError && <AppText style={[styles.error, { color: themeColors.danger }]}>{passwordError}</AppText>}
                {passwordStatus && <AppText style={[styles.success, { color: themeColors.success }]}>{passwordStatus}</AppText>}
                <AppButton
                    title={changePassword.isPending ? 'Updating...' : 'Update password'}
                    disabled={changePassword.isPending}
                    leftIcon={<Ionicons name="key-outline" size={18} color={themeColors.onPrimary} />}
                    onPress={handleChangePassword}
                />
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'devices'}
                maxHeight="92%"
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader title="Devices" description="Review and revoke active phone and watch sessions." />
                {sessionsQuery.isLoading && <AppText variant="muted">Loading active devices...</AppText>}
                {sessionsQuery.error && <AppText style={[styles.error, { color: themeColors.danger }]}>{sessionsQuery.error.message}</AppText>}
                {sessionsQuery.data?.sessions.map((session) => (
                    <View key={session.id} style={[styles.deviceRow, { borderBottomColor: themeColors.outlineVariant }]}>
                        <View style={styles.deviceText}>
                            <AppText variant="body" style={styles.deviceName}>
                                {session.device_name || (session.device_platform === 'wear_os' ? 'Wear OS device' : 'Android device')}
                            </AppText>
                            <AppText variant="caption">
                                {session.current ? 'This device | ' : ''}
                                {formatSessionActivity(session.last_used_at, session.created_at)}
                            </AppText>
                        </View>
                        <AppButton
                            title={revokeSession.isPending && revokeSession.variables === session.id ? 'Revoking...' : 'Revoke'}
                            variant={session.current ? 'danger' : 'ghost'}
                            disabled={revokeSession.isPending || revokeOtherSessions.isPending}
                            onPress={() => revokeSession.mutate(session.id)}
                        />
                    </View>
                ))}
                {(sessionsQuery.data?.sessions.length ?? 0) > 1 && (
                    <AppButton
                        title={revokeOtherSessions.isPending ? 'Revoking...' : 'Revoke other devices'}
                        variant="secondary"
                        disabled={revokeSession.isPending || revokeOtherSessions.isPending}
                        leftIcon={<Ionicons name="phone-portrait-outline" size={18} color={themeColors.onSurface} />}
                        onPress={() => revokeOtherSessions.mutate()}
                    />
                )}
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'offline'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader
                    title={isOutboxReady ? 'Offline changes' : 'Online-only browser changes'}
                    description={isOutboxReady
                        ? 'Writes saved on this device replay in order when the server is reachable.'
                        : 'The browser does not save pending writes yet. Stay online when adding or editing data.'}
                />
                {isOutboxReady ? (
                    <>
                        <View style={[styles.summaryRows, { backgroundColor: themeColors.surfaceContainer }]}>
                            <SummaryRow label="Pending" value={String(pendingMutationCount)} />
                            <SummaryRow label="Failed" value={String(failedMutations.length)} />
                        </View>
                        {failedMutations[0]?.lastError && (
                            <AppText style={[styles.error, { color: themeColors.danger }]}>Last failure: {failedMutations[0].lastError}</AppText>
                        )}
                        {outboxErrorMessage && <AppText style={[styles.error, { color: themeColors.danger }]}>{outboxErrorMessage}</AppText>}
                        <View style={styles.row}>
                            <AppButton
                                title={syncOutbox.isPending ? 'Syncing...' : 'Sync now'}
                                variant="secondary"
                                disabled={pendingMutationCount === 0 || failedMutations.length > 0 || syncOutbox.isPending || retryOutbox.isPending}
                                leftIcon={<Ionicons name="sync-outline" size={18} color={themeColors.onSurface} />}
                                onPress={() => syncOutbox.mutate()}
                                style={styles.rowButton}
                            />
                            {failedMutations.length > 0 && (
                                <AppButton
                                    title={retryOutbox.isPending ? 'Retrying...' : 'Retry failed'}
                                    variant="secondary"
                                    disabled={syncOutbox.isPending || retryOutbox.isPending}
                                    leftIcon={<Ionicons name="refresh-outline" size={18} color={themeColors.onSurface} />}
                                    onPress={() => retryOutbox.mutate()}
                                    style={styles.rowButton}
                                />
                            )}
                        </View>
                    </>
                ) : (
                    <AppText variant="muted">
                        If a browser request fails because the server is offline, Calibrate reports the failure and does not claim the change was queued.
                    </AppText>
                )}
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'data'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader
                    title="Your data"
                    description="Export a portable JSON copy or permanently delete this account."
                />
                {exportAccount.error && (
                    <AppText style={[styles.error, { color: themeColors.danger }]}>
                        {exportAccount.error instanceof Error ? exportAccount.error.message : 'Unable to export account data.'}
                    </AppText>
                )}
                <AppButton
                    title={exportAccount.isPending ? 'Preparing export...' : 'Export account data'}
                    variant="secondary"
                    disabled={exportAccount.isPending || deleteAccount.isPending}
                    leftIcon={<Ionicons name="share-outline" size={18} color={themeColors.onSurface} />}
                    onPress={() => exportAccount.mutate()}
                />
                <AppButton
                    title="Delete account"
                    variant="danger"
                    disabled={exportAccount.isPending || deleteAccount.isPending}
                    leftIcon={<Ionicons name="trash-outline" size={18} color={themeColors.onDanger} />}
                    onPress={() => setIsDeleteAccountOpen(true)}
                />
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'server'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader title="Advanced" description="Hosted and self-hosted server connection." />
                <TextField label="Server URL" value={serverInput} onChangeText={setServerInput} autoCapitalize="none" />
                <AppButton
                    title="Save connection"
                    leftIcon={<Ionicons name="server-outline" size={18} color={themeColors.onPrimary} />}
                    onPress={() => void handleSaveServer()}
                />
            </SettingsDetailSheet>

            <BottomSheetModal
                visible={isProfileEditorOpen}
                maxHeight="92%"
                onRequestClose={() => setIsProfileEditorOpen(false)}
            >
                <SectionHeader title="Profile details" description="Time zone and body details used for calorie targets." />
                <TimeZonePickerField value={timezone} onChange={setTimezone} />
                <DatePickerField
                    label="Date of birth"
                    value={dateOfBirth}
                    onChangeDate={setDateOfBirth}
                    maximumDate={getTodayDate(user?.timezone)}
                    fallbackDate="1990-01-01"
                />
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
                {saveProfile.error && <AppText style={[styles.error, { color: themeColors.danger }]}>{saveProfile.error.message}</AppText>}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={themeColors.onSurface} />}
                        onPress={() => setIsProfileEditorOpen(false)}
                        style={styles.rowButton}
                    />
                    <AppButton
                        title={saveProfile.isPending ? 'Saving...' : 'Save'}
                        disabled={saveProfile.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={themeColors.onPrimary} />}
                        onPress={() => saveProfile.mutate()}
                        style={styles.rowButton}
                    />
                </View>
            </BottomSheetModal>

            <BottomSheetModal
                visible={isDeleteAccountOpen}
                onRequestClose={() => setIsDeleteAccountOpen(false)}
            >
                <SectionHeader
                    title="Delete account permanently"
                    description={isOutboxReady
                        ? 'This cannot be undone. Pending offline changes on this device will also be discarded.'
                        : 'This cannot be undone. Browser changes are sent directly and there is no local write queue to discard.'}
                />
                <TextField
                    label="Current password"
                    secureTextEntry
                    value={deleteAccountPassword}
                    onChangeText={setDeleteAccountPassword}
                    editable={!deleteAccount.isPending}
                />
                <TextField
                    label={`Type ${DELETE_ACCOUNT_CONFIRMATION}`}
                    value={deleteAccountConfirmation}
                    onChangeText={setDeleteAccountConfirmation}
                    autoCapitalize="characters"
                    editable={!deleteAccount.isPending}
                />
                {deleteAccount.error && (
                    <AppText style={[styles.error, { color: themeColors.danger }]}>
                        {deleteAccount.error instanceof Error ? deleteAccount.error.message : 'Unable to delete account.'}
                    </AppText>
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        disabled={deleteAccount.isPending}
                        onPress={() => setIsDeleteAccountOpen(false)}
                        style={styles.rowButton}
                    />
                    <AppButton
                        title={deleteAccount.isPending ? 'Deleting...' : 'Delete forever'}
                        variant="danger"
                        disabled={
                            deleteAccount.isPending ||
                            !canSubmitAccountDeletion(deleteAccountPassword, deleteAccountConfirmation)
                        }
                        onPress={confirmDeleteAccount}
                        style={styles.rowButton}
                    />
                </View>
            </BottomSheetModal>
        </Screen>
    );
}

type PreferenceSwitchProps = {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
};

const PreferenceSwitch: React.FC<PreferenceSwitchProps> = ({ label, value, onValueChange }) => {
    const { colors: themeColors } = useAppTheme();

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: value }}
            onPress={() => onValueChange(!value)}
            style={({ pressed }) => [styles.switchRow, pressed && styles.pressedRow]}
        >
            <AppText variant="body" style={styles.switchLabel}>{label}</AppText>
            <Switch
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                value={value}
                trackColor={{ false: themeColors.outlineVariant, true: themeColors.primaryContainer }}
                thumbColor={value ? themeColors.primary : themeColors.outline}
            />
        </Pressable>
    );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.summaryRow}>
        <AppText variant="caption">{label}</AppText>
        <AppText variant="body" numberOfLines={1} style={styles.summaryValue}>{value}</AppText>
    </View>
);

type SettingsDetailSheetProps = {
    visible: boolean;
    maxHeight?: React.ComponentProps<typeof BottomSheetModal>['maxHeight'];
    onClose: () => void;
    children: React.ReactNode;
};

const SettingsDetailSheet: React.FC<SettingsDetailSheetProps> = ({
    visible,
    maxHeight,
    onClose,
    children
}) => (
    <BottomSheetModal visible={visible} maxHeight={maxHeight} onRequestClose={onClose}>
        <View style={styles.sheetContent}>{children}</View>
    </BottomSheetModal>
);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    sheetContent: {
        gap: spacing.md
    },
    accountSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    summaryAvatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    summaryText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    summaryEmail: {
        fontWeight: '900'
    },
    summaryRows: {
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs
    },
    summaryRow: {
        minHeight: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    summaryValue: {
        flexShrink: 1,
        textAlign: 'right',
        fontWeight: '800'
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
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden'
    },
    avatarImage: {
        width: '100%',
        height: '100%'
    },
    avatarActions: {
        flex: 1,
        gap: spacing.sm
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    deviceText: {
        flex: 1,
        minWidth: 0
    },
    deviceName: {
        fontWeight: '800'
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
    switchLabel: {
        flex: 1,
        fontWeight: '700'
    },
    pressedRow: {
        opacity: 0.78
    },
    notificationStatus: {
        gap: spacing.sm
    },
    success: {},
    error: {}
});
