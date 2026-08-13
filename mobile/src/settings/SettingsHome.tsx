import { Image, StyleSheet, View } from 'react-native';
import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from '@calibrate/shared';
import { AppText } from '../components/AppText';
import { SettingsRow, SettingsSection, SettingsStatusRow } from '../components/settings/SettingsList';
import { MOBILE_CLIENT_IDENTITY } from '../config/nativeClient';
import { spacing, useAppTheme } from '../theme';

export type SettingsSheetId =
    | 'preferences'
    | 'health-connect'
    | 'watch'
    | 'import'
    | 'profile-photo'
    | 'password'
    | 'devices'
    | 'offline'
    | 'data'
    | 'advanced';

type ProductLink = 'support' | 'privacy' | 'terms' | 'licenses';

type SettingsHomeProps = {
    email?: string | null;
    emailVerified?: boolean;
    profileImageUrl?: string | null;
    goalSummary: string;
    weightUnit: WeightUnit;
    heightUnit: HeightUnit;
    sessionCount?: number;
    isOutboxReady: boolean;
    failedMutationCount: number;
    pendingMutationCount: number;
    isWeb: boolean;
    onEditProfile: () => void;
    onOpenSheet: (sheet: SettingsSheetId) => void;
    onOpenActivity: () => void;
    onOpenSavedFoods: () => void;
    onOpenAbout: () => void;
    onOpenProductLink: (link: ProductLink) => void;
    onDeleteAccount: () => void;
    onLogout: () => void;
};

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

export function SettingsHome({
    email,
    emailVerified,
    profileImageUrl,
    goalSummary,
    weightUnit,
    heightUnit,
    sessionCount,
    isOutboxReady,
    failedMutationCount,
    pendingMutationCount,
    isWeb,
    onEditProfile,
    onOpenSheet,
    onOpenActivity,
    onOpenSavedFoods,
    onOpenAbout,
    onOpenProductLink,
    onDeleteAccount,
    onLogout
}: SettingsHomeProps) {
    const { colors } = useAppTheme();
    const unitSummary = `${weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg'} | ${
        heightUnit === HEIGHT_UNITS.FT_IN ? 'ft/in' : 'cm'
    }`;
    const offlineSummary = failedMutationCount > 0
        ? `${failedMutationCount} failed`
        : `${pendingMutationCount} pending`;

    let verificationValue = 'Not reported';
    let verificationText = email ?? 'Verification status for this account email.';
    if (emailVerified === true) {
        verificationValue = 'Verified';
    } else if (emailVerified === false) {
        verificationValue = 'Action required';
        verificationText = 'Verify this email before using all account features.';
    }
    return (
        <View testID="settings-home" style={styles.home}>
            <SettingsSection
                testID="settings-section-account"
                title="Account"
                description="Identity and access to this Calibrate account."
            >
                <View
                    testID="settings-account-summary"
                    style={[styles.accountSummary, { borderBottomColor: colors.outlineVariant }]}
                >
                    <View style={[styles.summaryAvatar, { backgroundColor: colors.primaryContainer }]}>
                        {profileImageUrl ? (
                            <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
                        ) : (
                            <AppText variant="subtitle" style={{ color: colors.onPrimaryContainer }}>
                                {getAvatarLabel(email)}
                            </AppText>
                        )}
                    </View>
                    <View style={styles.summaryText}>
                        <AppText
                            accessibilityRole="header"
                            aria-level={3}
                            ellipsizeMode="middle"
                            numberOfLines={1}
                            style={styles.summaryEmail}
                        >
                            {email ?? 'Calibrate account'}
                        </AppText>
                        <AppText variant="caption" numberOfLines={2}>{goalSummary}</AppText>
                    </View>
                </View>
                <SettingsStatusRow
                    testID="settings-email-verification"
                    icon="checkmark-circle-outline"
                    label="Email verification"
                    supportingText={verificationText}
                    value={verificationValue}
                    tone={emailVerified === true ? 'success' : 'warning'}
                />
                <SettingsRow
                    icon="image-outline"
                    label="Profile photo"
                    supportingText="Your avatar across Calibrate"
                    onPress={() => onOpenSheet('profile-photo')}
                />
                <SettingsRow
                    icon="log-out-outline"
                    label="Log out"
                    showDivider={false}
                    onPress={onLogout}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-personal"
                title="Personal details"
                description="Profile, units, reminders, and app behavior."
            >
                <SettingsRow
                    icon="person-outline"
                    label="Profile details"
                    supportingText="Body details, activity level, and time zone"
                    onPress={onEditProfile}
                />
                <SettingsRow
                    testID="settings-open-preferences"
                    icon="options-outline"
                    label="Preferences"
                    supportingText="Units, reminder intent, quiet hours, permissions, and haptics"
                    value={unitSummary}
                    showDivider={false}
                    onPress={() => onOpenSheet('preferences')}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-connections"
                title="Connections"
                description="Imported activity and companion devices."
            >
                <SettingsRow
                    icon="walk-outline"
                    label="Activity"
                    supportingText="Steps, active calories, and exercise history"
                    onPress={onOpenActivity}
                />
                <SettingsRow
                    icon="fitness-outline"
                    label="Health Connect"
                    supportingText="Read activity and weight from Android"
                    onPress={() => onOpenSheet('health-connect')}
                />
                <SettingsRow
                    icon="watch-outline"
                    label="Galaxy Watch"
                    supportingText="Pair, sync, and manage the Wear OS companion"
                    showDivider={false}
                    onPress={() => onOpenSheet('watch')}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-security"
                title="Security"
                description="Password and every signed-in browser, phone, or watch."
            >
                <SettingsRow
                    icon="key-outline"
                    label="Password"
                    supportingText="Change your password with current-password confirmation"
                    onPress={() => onOpenSheet('password')}
                />
                <SettingsRow
                    testID="settings-open-sessions"
                    icon="phone-portrait-outline"
                    label="Signed-in devices"
                    supportingText="Review and revoke browser, phone, and watch sessions"
                    value={sessionCount === undefined ? undefined : String(sessionCount)}
                    showDivider={false}
                    onPress={() => onOpenSheet('devices')}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-data"
                title="Data"
                description="Saved content, imports, offline changes, export, and deletion."
            >
                <SettingsRow
                    icon="restaurant-outline"
                    label="Saved foods"
                    supportingText="Foods and recipes you can quickly log"
                    onPress={onOpenSavedFoods}
                />
                <SettingsRow
                    icon="cloud-upload-outline"
                    label="Import from Lose It"
                    supportingText="Bring in a ZIP export"
                    onPress={() => onOpenSheet('import')}
                />
                <SettingsRow
                    icon="sync-outline"
                    label="Offline changes"
                    supportingText={isOutboxReady
                        ? 'Review work waiting to sync'
                        : 'Browser changes require an active connection'}
                    value={isOutboxReady ? offlineSummary : 'Online only'}
                    onPress={() => onOpenSheet('offline')}
                />
                <SettingsRow
                    testID="settings-export"
                    icon="share-outline"
                    label="Export account data"
                    supportingText="Download a portable JSON copy"
                    onPress={() => onOpenSheet('data')}
                />
                <SettingsRow
                    testID="settings-delete-account"
                    icon="trash-outline"
                    label="Delete account"
                    supportingText="Permanently delete this account after reauthentication"
                    danger
                    showDivider={false}
                    onPress={onDeleteAccount}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-help"
                title="Help"
                description="Support and documents about your rights and the software."
            >
                <SettingsRow
                    icon="help-circle-outline"
                    label="Support and feedback"
                    supportingText="Get help or tell us what could be better"
                    onPress={() => onOpenProductLink('support')}
                />
                <SettingsRow
                    icon="shield-checkmark-outline"
                    label="Privacy policy"
                    onPress={() => onOpenProductLink('privacy')}
                />
                <SettingsRow
                    icon="document-text-outline"
                    label="Terms of service"
                    onPress={() => onOpenProductLink('terms')}
                />
                <SettingsRow
                    icon="code-slash-outline"
                    label="Open-source licenses"
                    showDivider={false}
                    onPress={() => onOpenProductLink('licenses')}
                />
            </SettingsSection>

            <SettingsSection
                testID="settings-section-app"
                title={isWeb ? 'App' : 'App & Advanced'}
                description="Version, product information, and optional connection controls."
            >
                <SettingsRow
                    icon="information-circle-outline"
                    label="About Calibrate"
                    supportingText="Purpose, trust, version, and update details"
                    value={isWeb ? undefined : `v${MOBILE_CLIENT_IDENTITY.version}`}
                    showDivider={!isWeb}
                    onPress={onOpenAbout}
                />
                {!isWeb && (
                    <SettingsRow
                        icon="options-outline"
                        label="Advanced"
                        supportingText="Connection and technical options"
                        showDivider={false}
                        onPress={() => onOpenSheet('advanced')}
                    />
                )}
            </SettingsSection>
        </View>
    );
}

const styles = StyleSheet.create({
    home: {
        gap: spacing.lg
    },
    accountSummary: {
        minHeight: 78,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth
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
    avatarImage: {
        width: '100%',
        height: '100%'
    }
});
