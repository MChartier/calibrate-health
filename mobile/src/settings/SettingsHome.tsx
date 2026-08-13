import { Image, StyleSheet, View } from 'react-native';
import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from '@calibrate/shared';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { SettingsRow, SettingsSection } from '../components/settings/SettingsList';
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

type SettingsHomeProps = {
    email?: string | null;
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
    onOpenProductLink: (link: 'support' | 'privacy' | 'terms') => void;
    onLogout: () => void;
};

function getAvatarLabel(email?: string | null): string {
    return email?.trim().charAt(0).toUpperCase() || 'C';
}

export function SettingsHome({
    email,
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
    onLogout
}: SettingsHomeProps) {
    const { colors } = useAppTheme();
    const unitSummary = `${weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg'} | ${
        heightUnit === HEIGHT_UNITS.FT_IN ? 'ft/in' : 'cm'
    }`;
    const offlineSummary = failedMutationCount > 0
        ? `${failedMutationCount} failed`
        : `${pendingMutationCount} pending`;

    return (
        <>
            <AppCard style={{ backgroundColor: colors.surface, borderColor: colors.outlineVariant }}>
                <View style={styles.accountSummary}>
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
                            aria-level={2}
                            ellipsizeMode="middle"
                            numberOfLines={1}
                            style={styles.summaryEmail}
                        >
                            {email ?? 'Calibrate account'}
                        </AppText>
                        <AppText variant="caption" numberOfLines={2}>{goalSummary}</AppText>
                    </View>
                </View>
            </AppCard>

            <SettingsSection title="Personal" description="Your profile and how Calibrate works for you.">
                <SettingsRow
                    icon="person-outline"
                    label="Profile details"
                    supportingText="Body details, activity level, and time zone"
                    onPress={onEditProfile}
                />
                <SettingsRow
                    icon="options-outline"
                    label="Preferences"
                    supportingText="Units, reminders, notifications, and haptics"
                    value={unitSummary}
                    onPress={() => onOpenSheet('preferences')}
                />
                <SettingsRow
                    icon="image-outline"
                    label="Profile photo"
                    supportingText="Your avatar across Calibrate"
                    showDivider={false}
                    onPress={() => onOpenSheet('profile-photo')}
                />
            </SettingsSection>

            <SettingsSection title="Connections" description="Health data and companion devices.">
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
                    onPress={() => onOpenSheet('watch')}
                />
                <SettingsRow
                    icon="phone-portrait-outline"
                    label="Signed-in devices"
                    supportingText="Review and revoke phone and watch sessions"
                    value={sessionCount === undefined ? undefined : String(sessionCount)}
                    showDivider={false}
                    onPress={() => onOpenSheet('devices')}
                />
            </SettingsSection>

            <SettingsSection title="Data" description="Import, sync, export, and privacy controls.">
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
                    icon="shield-checkmark-outline"
                    label="Your data"
                    supportingText="Export or permanently delete your account"
                    showDivider={false}
                    onPress={() => onOpenSheet('data')}
                />
            </SettingsSection>

            <SettingsSection title="Security">
                <SettingsRow
                    icon="key-outline"
                    label="Password"
                    supportingText="Change your account password"
                    showDivider={false}
                    onPress={() => onOpenSheet('password')}
                />
            </SettingsSection>

            <SettingsSection title="Help & legal">
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
                    showDivider={false}
                    onPress={() => onOpenProductLink('terms')}
                />
            </SettingsSection>

            <SettingsSection title="App">
                <SettingsRow
                    icon="information-circle-outline"
                    label="About Calibrate"
                    supportingText="Purpose, trust, version, and open-source licenses"
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

            <SettingsSection title="Account">
                <SettingsRow
                    icon="log-out-outline"
                    label="Log out"
                    danger
                    showDivider={false}
                    onPress={onLogout}
                />
            </SettingsSection>
        </>
    );
}

const styles = StyleSheet.create({
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
    avatarImage: {
        width: '100%',
        height: '100%'
    }
});
