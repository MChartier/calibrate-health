import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVITY_LEVELS, HEIGHT_UNITS, WEIGHT_UNITS, type ActivityLevel, type HeightUnit, type Sex, type WeightUnit } from '@calibrate/shared';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../../src/components/AsyncStateBoundary';
import { HealthConnectCard } from '../../../src/components/HealthConnectCard';
import { WearPairingCard } from '../../../src/components/WearPairingCard';
import { BottomSheetModal } from '../../../src/components/BottomSheetModal';
import { confirmDiscardChanges } from '../../../src/components/confirmDiscardChanges';
import { TabScreen } from '../../../src/components/TabScreen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { SegmentedControl } from '../../../src/components/SegmentedControl';
import { TextField } from '../../../src/components/TextField';
import { SkeletonBlock } from '../../../src/components/SkeletonBlock';
import { useAuth } from '../../../src/auth/AuthContext';
import { invalidateProfilePlanningQueries } from '../../../src/caloriePlanning/queryInvalidation';
import {
    canSubmitAccountDeletion,
    deleteAccountAndClearLocalData,
    shareAccountExport
} from '../../../src/account/accountData';
import { OUTBOX_MUTATION_STATES } from '../../../src/offline/queuedMutation';
import { useOfflineOutbox } from '../../../src/offline/provider';
import { hasPendingWeightMutation } from '../../../src/offline/pendingWeight';
import { useNativePushRegistration } from '../../../src/hooks/useNativePushRegistration';
import { getPushStatusPresentation, getPushStatusTarget } from '../../../src/notifications/workflow';
import { supportsAndroidIntegrations } from '../../../src/platform/nativePlatform';
import { millimetersToCentimeters, millimetersToFeetInches } from '../../../src/utils/bodyMeasurements';
import { formatGoalSummary } from '../../../src/utils/goals';
import { HEIGHT_UNIT_OPTIONS, WEIGHT_UNIT_OPTIONS } from '../../../src/utils/profileOptions';
import { radius, spacing, useAppTheme } from '../../../src/theme';
import { useHealthConnect } from '../../../src/healthConnect/provider';
import { clearWearAccountData } from '../../../src/wear/accountCleanup';
import { canonicalPathForRoute, type RouteId } from '../../../src/navigation/routeRegistry';
import {
    DeleteAccountSheet,
    ProfileEditorSheet
} from '../../../src/settings/AccountSettingsSheets';
import { SettingsCategoryPage } from '../../../src/settings/SettingsCategoryPage';
import {
    SettingsHome,
    shouldShowSettingsResourceStatus,
    type SettingsCategoryId,
    type SettingsSheetId
} from '../../../src/settings/SettingsHome';
import { AccountSessionsPanel } from '../../../src/settings/AccountSessionsPanel';
import { ConnectedAppsPanel } from '../../../src/settings/ConnectedAppsPanel';
import { ReminderSettingsPanel } from '../../../src/settings/ReminderSettingsPanel';
import {
    getReminderScheduleErrors,
    hasReminderScheduleErrors,
    toReminderSchedulePayload
} from '../../../src/settings/reminderWallClock';
import {
    PreferenceSwitch,
    SettingsDetailSheet,
    SummaryRow
} from '../../../src/settings/SettingsPrimitives';
import {
    ASYNC_RESOURCE_STATES,
    isNeverEmpty,
    isNullResource,
    type AsyncResourceState
} from '../../../src/asyncState/resolveAsyncState';
import { getSafeActionErrorMessage } from '../../../src/errors/presentation';
import { getCaloriePlanPresentation } from '../../../src/caloriePlanning/presentation';
import { getHeightPolicyError, isHeightWithinPolicy } from '../../../src/caloriePlanning/heightInput';

const MIN_PASSWORD_LENGTH = 8;
const SETTINGS_CATEGORY_ROUTES = {
    profile: 'settings-profile',
    security: 'settings-security',
    connections: 'settings-connections',
    data: 'settings-data',
    help: 'settings-help'
} as const satisfies Record<SettingsCategoryId, RouteId>;

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

function hasResolvedResourceData(state: AsyncResourceState): boolean {
    return state.kind === ASYNC_RESOURCE_STATES.CONTENT
        || state.kind === ASYNC_RESOURCE_STATES.EMPTY
        || state.kind === ASYNC_RESOURCE_STATES.STALE
        || state.kind === ASYNC_RESOURCE_STATES.DEGRADED;
}

type SettingsScreenProps = {
    category?: SettingsCategoryId;
};

export function SettingsScreen({ category }: SettingsScreenProps) {
    const router = useRouter();
    const {
        api, user, clearLocalSession, logout, persistAccountDeletionCleanupNotice,
        serverUrl, updateCurrentUser
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
    const isOnline = useOnlineStatus();
    const healthConnect = useHealthConnect();
    const nativePush = useNativePushRegistration();
    const isWeb = Platform.OS === 'web';
    const showAndroidIntegrations = supportsAndroidIntegrations();
    const pushStatus = getPushStatusPresentation(nativePush.state, getPushStatusTarget(Platform.OS));
    const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
    const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth?.slice(0, 10) ?? '');
    const [sex, setSex] = useState<Sex | null>(user?.sex ?? null);
    const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(user?.activity_level ?? ACTIVITY_LEVELS.LIGHT);
    const [heightCm, setHeightCm] = useState(() => millimetersToCentimeters(user?.height_mm));
    const initialImperialHeight = millimetersToFeetInches(user?.height_mm);
    const [heightFeet, setHeightFeet] = useState(initialImperialHeight.feet);
    const [heightInches, setHeightInches] = useState(initialImperialHeight.inches);
    const [profileValidationError, setProfileValidationError] = useState<string | null>(null);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(user?.weight_unit ?? WEIGHT_UNITS.KG);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(user?.height_unit ?? HEIGHT_UNITS.CM);
    const [logFoodReminders, setLogFoodReminders] = useState(user?.reminder_log_food_enabled ?? true);
    const [logWeightReminders, setLogWeightReminders] = useState(user?.reminder_log_weight_enabled ?? true);
    const [logFoodReminderTime, setLogFoodReminderTime] = useState(user?.reminder_log_food_time ?? '09:00');
    const [logWeightReminderTime, setLogWeightReminderTime] = useState(user?.reminder_log_weight_time ?? '09:00');
    const [quietHoursStart, setQuietHoursStart] = useState(user?.reminder_quiet_hours_start ?? '');
    const [quietHoursEnd, setQuietHoursEnd] = useState(user?.reminder_quiet_hours_end ?? '');
    const [hapticsEnabled, setHapticsEnabled] = useState(user?.haptics_enabled ?? true);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
    const [activeSheet, setActiveSheet] = useState<SettingsSheetId | null>(null);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
    const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
    const reminderSchedule = {
        foodTime: logFoodReminderTime,
        weightTime: logWeightReminderTime,
        quietStart: quietHoursStart,
        quietEnd: quietHoursEnd
    };
    const reminderScheduleErrors = getReminderScheduleErrors(reminderSchedule);
    const reminderScheduleIsInvalid = hasReminderScheduleErrors(reminderScheduleErrors);
    const profileIsDirty = Boolean(user && (
        timezone !== user.timezone
        || dateOfBirth !== (user.date_of_birth?.slice(0, 10) ?? '')
        || sex !== user.sex
        || activityLevel !== (user.activity_level ?? ACTIVITY_LEVELS.LIGHT)
        || heightCm !== millimetersToCentimeters(user.height_mm)
        || heightFeet !== millimetersToFeetInches(user.height_mm).feet
        || heightInches !== millimetersToFeetInches(user.height_mm).inches
    ));
    const preferencesAreDirty = Boolean(user && (
        weightUnit !== user.weight_unit
        || heightUnit !== user.height_unit
        || logFoodReminders !== user.reminder_log_food_enabled
        || logWeightReminders !== user.reminder_log_weight_enabled
        || logFoodReminderTime !== (user.reminder_log_food_time ?? '09:00')
        || logWeightReminderTime !== (user.reminder_log_weight_time ?? '09:00')
        || quietHoursStart !== (user.reminder_quiet_hours_start ?? '')
        || quietHoursEnd !== (user.reminder_quiet_hours_end ?? '')
        || hapticsEnabled !== user.haptics_enabled
    ));
    const passwordIsDirty = Boolean(currentPassword || newPassword || confirmPassword);
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const goalQuery = useQuery({ queryKey: ['mobile-goal'], queryFn: () => api.getGoals() });
    const sessionsQuery = useQuery({
        queryKey: ['account-sessions'],
        queryFn: () => api.getAccountSessions()
    });
    const connectedAppsQuery = useQuery({
        queryKey: ['connected-apps'],
        queryFn: () => api.getConnectedApps()
    });
    const profileState = useAsyncResourceState(profileQuery, isNeverEmpty);
    const goalState = useAsyncResourceState(goalQuery, isNullResource);
    const sessionsState = useAsyncResourceState(
        sessionsQuery,
        ({ sessions }) => sessions.length === 0
    );
    const connectedAppsState = useAsyncResourceState(
        connectedAppsQuery,
        ({ connections }) => connections.length === 0
    );
    const pendingMutationCount = queuedMutations.filter(
        ({ state }) => state === OUTBOX_MUTATION_STATES.PENDING || state === OUTBOX_MUTATION_STATES.REPLAYING
    ).length;
    const hasPendingWeightChange = hasPendingWeightMutation(queuedMutations);
    const failedMutations = queuedMutations.filter(({ state }) => state === OUTBOX_MUTATION_STATES.FAILED);
    const syncOutbox = useMutation({ mutationFn: () => reconcileOutbox() });
    const retryOutbox = useMutation({ mutationFn: () => retryFailedOutbox() });
    const outboxActionError = syncOutbox.error ?? retryOutbox.error;
    let outboxErrorMessage = outboxInitializationError
        ? 'Offline changes are not available on this device. Reload Calibrate and try again.'
        : null;
    if (!outboxErrorMessage && outboxActionError) {
        outboxErrorMessage = getSafeActionErrorMessage(
            outboxActionError,
            'Unable to sync offline changes. Try again.'
        );
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
        setLogFoodReminderTime(user.reminder_log_food_time ?? '09:00');
        setLogWeightReminderTime(user.reminder_log_weight_time ?? '09:00');
        setQuietHoursStart(user.reminder_quiet_hours_start ?? '');
        setQuietHoursEnd(user.reminder_quiet_hours_end ?? '');
        setHapticsEnabled(user.haptics_enabled);
    }, [user]);

    function closeProfileEditor() {
        if (user) {
            setTimezone(user.timezone);
            setDateOfBirth(user.date_of_birth?.slice(0, 10) ?? '');
            setSex(user.sex);
            setActivityLevel(user.activity_level ?? ACTIVITY_LEVELS.LIGHT);
            setHeightCm(millimetersToCentimeters(user.height_mm));
            const nextImperialHeight = millimetersToFeetInches(user.height_mm);
            setHeightFeet(nextImperialHeight.feet);
            setHeightInches(nextImperialHeight.inches);
        }
        setProfileValidationError(null);
        setIsProfileEditorOpen(false);
    }

    function closePreferences() {
        if (user) {
            setWeightUnit(user.weight_unit);
            setHeightUnit(user.height_unit);
            setLogFoodReminders(user.reminder_log_food_enabled);
            setLogWeightReminders(user.reminder_log_weight_enabled);
            setLogFoodReminderTime(user.reminder_log_food_time ?? '09:00');
            setLogWeightReminderTime(user.reminder_log_weight_time ?? '09:00');
            setQuietHoursStart(user.reminder_quiet_hours_start ?? '');
            setQuietHoursEnd(user.reminder_quiet_hours_end ?? '');
            setHapticsEnabled(user.haptics_enabled);
        }
        setActiveSheet(null);
    }

    function closePasswordEditor() {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError(null);
        setPasswordStatus(null);
        setActiveSheet(null);
    }

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
            await invalidateProfilePlanningQueries(queryClient);
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
                ...toReminderSchedulePayload(reminderSchedule),
                haptics_enabled: hapticsEnabled
            }),
        onSuccess: async (response) => {
            updateCurrentUser(response.user);
            await invalidateProfilePlanningQueries(queryClient);
            setActiveSheet(null);
        }
    });

    function handleSavePreferences() {
        if (reminderScheduleIsInvalid) return;
        savePreferences.mutate();
    }

    function handleSaveProfile() {
        const heightIsValid = isHeightWithinPolicy({
            unit: heightUnit,
            centimeters: Number(heightCm),
            feet: Number(heightFeet),
            inches: Number(heightInches || '0')
        });
        if (!heightIsValid) {
            setProfileValidationError(getHeightPolicyError(heightUnit));
            return;
        }
        setProfileValidationError(null);
        saveProfile.mutate();
    }

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
            setPasswordError(getSafeActionErrorMessage(error, 'Unable to update password.'));
        }
    });

    const revokeSession = useMutation({
        mutationFn: (sessionId: string) => api.revokeAccountSession(sessionId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['account-sessions'] });
        }
    });

    const revokeOtherSessions = useMutation({
        mutationFn: () => api.revokeOtherAccountSessions(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['account-sessions'] });
        }
    });

    const revokeConnectedApp = useMutation({
        mutationFn: (connectionId: string) => api.revokeConnectedApp(connectionId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['connected-apps'] });
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

    function closeDeleteAccountEditor() {
        setDeleteAccountPassword('');
        setDeleteAccountConfirmation('');
        deleteAccount.reset();
        setIsDeleteAccountOpen(false);
    }

    function confirmDeleteAccount() {
        if (!canSubmitAccountDeletion(deleteAccountPassword, deleteAccountConfirmation)) return;
        deleteAccount.mutate();
    }

    let goalSummary = 'Current goal unavailable';
    if (goalState.kind === ASYNC_RESOURCE_STATES.LOADING) {
        goalSummary = 'Loading current goal...';
    } else if (hasResolvedResourceData(goalState)) {
        goalSummary = formatGoalSummary(goalQuery.data ?? null, user?.weight_unit);
    }
    const sessionCount = hasResolvedResourceData(sessionsState)
        ? sessionsQuery.data?.sessions.length
        : undefined;
    const connectedAppCount = hasResolvedResourceData(connectedAppsState)
        ? connectedAppsQuery.data?.connections.length
        : undefined;
    const calorieTarget = !hasPendingWeightChange && hasResolvedResourceData(profileState)
        && profileQuery.data?.calorieSummary.planStatus === 'available'
        ? profileQuery.data.calorieSummary.dailyCalorieTarget
        : undefined;
    const planRequiresReview = !hasPendingWeightChange && profileQuery.data?.calorieSummary.planStatus === 'requires_review';
    const planPresentation = getCaloriePlanPresentation(
        profileQuery.data?.calorieSummary.planReasonCode,
        profileQuery.data?.calorieSummary.planStatus
    );
    const showProfilePlanningStatus = category === undefined || category === 'profile';
    function handlePlanAction() {
        if (planPresentation.actionKind === 'profile') {
            setIsProfileEditorOpen(true);
            return;
        }
        if (planPresentation.actionKind === 'weight') {
            router.push('/weight');
            return;
        }
        router.push({
            pathname: '/progress',
            params: { openPlanReview: 'true' }
        });
    }

    return (
        <TabScreen>
            {showProfilePlanningStatus && hasPendingWeightChange && (
                <AppCard>
                    <AppText variant="subtitle">Weight change syncing</AppText>
                    <AppText variant="muted">
                        Calorie target and projection will return after the server rechecks your plan.
                    </AppText>
                </AppCard>
            )}
            {showProfilePlanningStatus && planRequiresReview && (
                <AppCard>
                    <AppText variant="subtitle">{planPresentation.title}</AppText>
                    <AppText variant="muted">{planPresentation.message}</AppText>
                    <AppButton
                        title={planPresentation.actionLabel}
                        variant="secondary"
                        onPress={handlePlanAction}
                    />
                </AppCard>
            )}
            {showProfilePlanningStatus && shouldShowSettingsResourceStatus(profileState, isWeb) && (
                <AsyncStateBoundary
                    state={profileState}
                    resourceLabel="profile settings"
                    loading={<SettingsResourceSkeleton label="Loading profile settings..." />}
                    empty={null}
                    onRetry={isOnline ? () => profileQuery.refetch() : undefined}
                >
                    {null}
                </AsyncStateBoundary>
            )}
            {showProfilePlanningStatus && shouldShowSettingsResourceStatus(goalState, isWeb) && (
                <AsyncStateBoundary
                    state={goalState}
                    resourceLabel="your current goal"
                    loading={<SettingsResourceSkeleton label="Loading your current goal..." />}
                    empty={null}
                    onRetry={isOnline ? () => goalQuery.refetch() : undefined}
                >
                    {null}
                </AsyncStateBoundary>
            )}
            {category ? (
                <SettingsCategoryPage
                    category={category}
                    showAndroidIntegrations={showAndroidIntegrations}
                    sessionCount={sessionCount}
                    connectedAppCount={connectedAppCount}
                    isOutboxReady={isOutboxReady}
                    failedMutationCount={failedMutations.length}
                    pendingMutationCount={pendingMutationCount}
                    isWeb={isWeb}
                    onEditProfile={() => setIsProfileEditorOpen(true)}
                    onOpenSheet={setActiveSheet}
                    onOpenActivity={() => router.push(canonicalPathForRoute('activity') as Href)}
                    onOpenSavedFoods={() => router.push(canonicalPathForRoute('my-foods') as Href)}
                    onOpenAbout={() => router.push(canonicalPathForRoute('about') as Href)}
                    onOpenAdvanced={() => router.push(canonicalPathForRoute('advanced') as Href)}
                    onOpenProductLink={(link) => router.push(CALIBRATE_PRODUCT_LINKS[link] as Href)}
                    onDeleteAccount={() => setIsDeleteAccountOpen(true)}
                    onLogout={() => void logout()}
                />
            ) : (
                <SettingsHome
                    email={user?.email}
                    profileImageUrl={user?.profile_image_url}
                    goalSummary={goalSummary}
                    weightUnit={weightUnit}
                    heightUnit={heightUnit}
                    sessionCount={sessionCount}
                    connectedAppCount={connectedAppCount}
                    isOutboxReady={isOutboxReady}
                    failedMutationCount={failedMutations.length}
                    pendingMutationCount={pendingMutationCount}
                    isWeb={isWeb}
                    onOpenCategory={(nextCategory) => {
                        router.push(canonicalPathForRoute(SETTINGS_CATEGORY_ROUTES[nextCategory]) as Href);
                    }}
                />
            )}

            <SettingsDetailSheet
                visible={activeSheet === 'preferences'}
                maxHeight="92%"
                title="Preferences"
                description="Units, reminder intent, delivery permission, quiet hours, and interaction feedback."
                dismissDisabled={savePreferences.isPending}
                isDirty={preferencesAreDirty}
                confirmDismiss={confirmDiscardChanges}
                onClose={closePreferences}
            >
                <View testID="settings-preferences-sheet" style={styles.sheetContent}>
                    <AppText variant="label">Weight unit</AppText>
                    <SegmentedControl accessibilityLabel="Weight unit" options={WEIGHT_UNIT_OPTIONS} value={weightUnit} onChange={setWeightUnit} />
                    <AppText variant="label">Height unit</AppText>
                    <SegmentedControl accessibilityLabel="Height unit" options={HEIGHT_UNIT_OPTIONS} value={heightUnit} onChange={setHeightUnit} />
                    <ReminderSettingsPanel
                        timezone={timezone}
                        logFoodEnabled={logFoodReminders}
                        logWeightEnabled={logWeightReminders}
                        foodTime={logFoodReminderTime}
                        weightTime={logWeightReminderTime}
                        quietStart={quietHoursStart}
                        quietEnd={quietHoursEnd}
                        errors={reminderScheduleErrors}
                        deliveryStatus={pushStatus}
                        isWeb={isWeb}
                        onLogFoodEnabledChange={setLogFoodReminders}
                        onLogWeightEnabledChange={setLogWeightReminders}
                        onFoodTimeChange={setLogFoodReminderTime}
                        onWeightTimeChange={setLogWeightReminderTime}
                        onQuietStartChange={setQuietHoursStart}
                        onQuietEndChange={setQuietHoursEnd}
                        onRequestPermission={() => void nativePush.requestPermission()}
                        onOpenPermissionSettings={() => void nativePush.openSettings()}
                        onRefreshPermission={() => void nativePush.refreshPermission()}
                        onRetryRegistration={() => void nativePush.retryRegistration()}
                        onDisableRegistration={nativePush.disableRegistration
                            ? () => void nativePush.disableRegistration?.()
                            : undefined}
                    />
                    <PreferenceSwitch
                        label="Haptics"
                        value={hapticsEnabled}
                        onValueChange={setHapticsEnabled}
                    />
                    {savePreferences.error && (
                        <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                            {getSafeActionErrorMessage(savePreferences.error, 'Unable to save preferences.')}
                        </AppText>
                    )}
                    <AppButton
                        title={savePreferences.isPending ? 'Saving...' : 'Save preferences'}
                        disabled={savePreferences.isPending || reminderScheduleIsInvalid}
                        leftIcon={<Ionicons name="options-outline" size={18} color={themeColors.onPrimary} />}
                        onPress={handleSavePreferences}
                    />
                </View>
            </SettingsDetailSheet>

            {showAndroidIntegrations ? (
                <>
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
                </>
            ) : null}

            <SettingsDetailSheet
                visible={activeSheet === 'import'}
                onClose={() => setActiveSheet(null)}
            >
                <SectionHeader title="Import" description="Import a Lose It ZIP export into food logs and weigh-ins." />
                {importMutation.data && (
                    <>
                        <AppText variant="muted">
                            Imported {importMutation.data.food_logs.valid} food rows and {importMutation.data.weights.valid} weights.
                        </AppText>
                        {importMutation.data.foodDayCompletionMessage && (
                            <AppText variant="muted">{importMutation.data.foodDayCompletionMessage}</AppText>
                        )}
                    </>
                )}
                {importMutation.error && (
                    <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                        {getSafeActionErrorMessage(importMutation.error, 'Unable to import that ZIP file.')}
                    </AppText>
                )}
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
                    <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                        {getSafeActionErrorMessage(
                            updateProfileImage.error ?? removeProfileImage.error,
                            'Unable to update your profile photo.'
                        )}
                    </AppText>
                )}
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'password'}
                maxHeight="92%"
                title="Password"
                description="Update the password for this account."
                dismissDisabled={changePassword.isPending}
                isDirty={passwordIsDirty}
                confirmDismiss={confirmDiscardChanges}
                onClose={closePasswordEditor}
            >
                <TextField
                    label="Current password"
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    errorText={passwordError === 'Enter your current password.' ? passwordError : undefined}
                    focusError={passwordError === 'Enter your current password.'}
                />
                <TextField
                    label="New password"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                    helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    errorText={passwordError?.startsWith('New password must') ? passwordError : undefined}
                    focusError={Boolean(passwordError?.startsWith('New password must'))}
                />
                <TextField
                    label="Confirm new password"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    errorText={passwordError === 'New passwords do not match.' ? passwordError : undefined}
                    focusError={passwordError === 'New passwords do not match.'}
                />
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
                title="Signed-in devices"
                description="Review every browser, Android, iOS, and Wear OS session for this account."
                onClose={() => setActiveSheet(null)}
            >
                <View testID="settings-sessions" style={styles.sheetContent}>
                    <AsyncStateBoundary
                        state={sessionsState}
                        resourceLabel="signed-in sessions"
                        loading={<DeviceListSkeleton />}
                        empty={(
                            <AppCard>
                                <AppText variant="subtitle">No signed-in sessions found</AppText>
                                <AppText variant="muted">Refresh to check this account again.</AppText>
                            </AppCard>
                        )}
                        onRetry={isOnline ? () => sessionsQuery.refetch() : undefined}
                        retrying={sessionsQuery.isFetching}
                    >
                        <AccountSessionsPanel
                            sessions={sessionsQuery.data?.sessions ?? []}
                            pendingSessionId={revokeSession.isPending ? revokeSession.variables : undefined}
                            revokingOthers={revokeOtherSessions.isPending}
                            onRevoke={async (sessionId) => { await revokeSession.mutateAsync(sessionId); }}
                            onRevokeOthers={async () => { await revokeOtherSessions.mutateAsync(); }}
                        />
                    </AsyncStateBoundary>
                    {(revokeSession.error || revokeOtherSessions.error) && (
                        <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                            {getSafeActionErrorMessage(
                                revokeSession.error ?? revokeOtherSessions.error,
                                'Unable to revoke that signed-in session.'
                            )}
                        </AppText>
                    )}
                </View>
            </SettingsDetailSheet>

            <SettingsDetailSheet
                visible={activeSheet === 'connected-apps'}
                maxHeight="92%"
                title="Connected assistants"
                description="Assistants use revocable, read-only OAuth access. They never receive your Calibrate password."
                onClose={() => setActiveSheet(null)}
            >
                <View testID="settings-connected-apps" style={styles.sheetContent}>
                    <AsyncStateBoundary
                        state={connectedAppsState}
                        resourceLabel="connected assistants"
                        loading={<DeviceListSkeleton />}
                        empty={(
                            <AppCard>
                                <AppText variant="subtitle">No connected assistants</AppText>
                                <AppText variant="muted">Connections you approve will appear here.</AppText>
                            </AppCard>
                        )}
                        onRetry={isOnline ? () => connectedAppsQuery.refetch() : undefined}
                        retrying={connectedAppsQuery.isFetching}
                    >
                        <ConnectedAppsPanel
                            connections={connectedAppsQuery.data?.connections ?? []}
                            pendingConnectionId={revokeConnectedApp.isPending
                                ? revokeConnectedApp.variables
                                : undefined}
                            onRevoke={async (connectionId) => {
                                await revokeConnectedApp.mutateAsync(connectionId);
                            }}
                        />
                    </AsyncStateBoundary>
                    {revokeConnectedApp.error && (
                        <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                            {getSafeActionErrorMessage(
                                revokeConnectedApp.error,
                                'Unable to revoke that connected assistant.'
                            )}
                        </AppText>
                    )}
                </View>
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
                        {failedMutations.length > 0 && (
                            <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                                A saved change could not sync. Retry it or discard offline changes.
                            </AppText>
                        )}
                        {outboxErrorMessage && (
                            <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                                {outboxErrorMessage}
                            </AppText>
                        )}
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
                title="Export your data"
                description="Download a portable JSON copy of your Calibrate account."
                onClose={() => setActiveSheet(null)}
            >
                <View testID="settings-export-sheet" style={styles.sheetContent}>
                    {exportAccount.error && (
                        <AppText accessibilityRole="alert" style={[styles.error, { color: themeColors.danger }]}>
                            {getSafeActionErrorMessage(exportAccount.error, 'Unable to export account data.')}
                        </AppText>
                    )}
                    <AppButton
                        title={exportAccount.isPending ? 'Preparing export...' : 'Export account data'}
                        variant="secondary"
                        disabled={exportAccount.isPending}
                        leftIcon={<Ionicons name="share-outline" size={18} color={themeColors.onSurface} />}
                        onPress={() => exportAccount.mutate()}
                    />
                </View>
            </SettingsDetailSheet>

            <ProfileEditorSheet
                visible={isProfileEditorOpen}
                timezone={timezone}
                onTimezoneChange={setTimezone}
                dateOfBirth={dateOfBirth}
                onDateOfBirthChange={setDateOfBirth}
                sex={sex}
                onSexChange={setSex}
                activityLevel={activityLevel}
                onActivityLevelChange={setActivityLevel}
                heightUnit={heightUnit}
                heightCm={heightCm}
                onHeightCmChange={setHeightCm}
                heightFeet={heightFeet}
                onHeightFeetChange={setHeightFeet}
                heightInches={heightInches}
                onHeightInchesChange={setHeightInches}
                calorieTarget={calorieTarget}
                validationError={profileValidationError}
                saveError={saveProfile.error}
                isSaving={saveProfile.isPending}
                isDirty={profileIsDirty}
                onClose={closeProfileEditor}
                onSave={handleSaveProfile}
            />

            <DeleteAccountSheet
                visible={isDeleteAccountOpen}
                isOutboxReady={isOutboxReady}
                password={deleteAccountPassword}
                onPasswordChange={setDeleteAccountPassword}
                confirmation={deleteAccountConfirmation}
                onConfirmationChange={setDeleteAccountConfirmation}
                error={deleteAccount.error}
                isDeleting={deleteAccount.isPending}
                onClose={closeDeleteAccountEditor}
                onConfirm={confirmDeleteAccount}
            />
        </TabScreen>
    );
}

export default function SettingsRoute() {
    return <SettingsScreen />;
}

const SettingsResourceSkeleton: React.FC<{ label: string }> = ({ label }) => (
    <AppCard accessibilityLabel={label}>
        <AppText variant="muted">{label}</AppText>
        <SkeletonBlock width="72%" height={18} />
    </AppCard>
);

const DeviceListSkeleton: React.FC = () => (
    <AppCard accessibilityLabel="Loading active devices">
        {[0, 1].map((row) => (
            <View key={row} style={styles.deviceSkeletonRow}>
                <View style={styles.deviceSkeletonCopy}>
                    <SkeletonBlock width="58%" height={18} />
                    <SkeletonBlock width="76%" height={14} />
                </View>
                <SkeletonBlock width={72} height={36} />
            </View>
        ))}
    </AppCard>
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
    summaryRows: {
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs
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

    deviceSkeletonRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.md,
        minHeight: 52
    },
    deviceSkeletonCopy: {
        flex: 1,
        gap: spacing.sm
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },

    success: {},
    error: {}
});
