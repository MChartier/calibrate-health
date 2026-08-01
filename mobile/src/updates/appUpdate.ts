import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import appConfig from '../../app.json';
import release from '../../../shared/release.json';

export type RunningUpdateInfo = {
    updateId?: string;
    channel?: string;
    createdAt?: Date;
    isEmbeddedLaunch: boolean;
    isEmergencyLaunch: boolean;
    emergencyLaunchReason: string | null;
    runtimeVersion?: string;
};

export type AppVersionInfo = {
    nativeVersion: string;
    nativeBuild: string;
    nativeReleaseTag: string;
    runtimeVersion: string;
    channel: string;
    updateId: string | null;
    updateLabel: string;
    updateCreatedAt: Date | null;
    isEmbeddedLaunch: boolean;
    isEmergencyLaunch: boolean;
    emergencyLaunchReason: string | null;
};

type AppVersionInfoInput = {
    platform: string;
    isDevelopment: boolean;
    nativeApplicationVersion: string | null;
    nativeBuildVersion: string | null;
    fallbackNativeVersion: string;
    fallbackNativeBuild: string;
    nativeReleaseTag: string;
    runningUpdate: RunningUpdateInfo;
};

export type AppUpdateCheckOutcome = 'available' | 'rollback' | 'current';

export type AppUpdateRuntime = {
    checkForUpdateAsync: () => Promise<{
        isAvailable: boolean;
        isRollBackToEmbedded: boolean;
    }>;
    fetchUpdateAsync: () => Promise<{
        isNew: boolean;
        isRollBackToEmbedded: boolean;
    }>;
    reloadAsync: () => Promise<void>;
};

export const appUpdateRuntime: AppUpdateRuntime = {
    checkForUpdateAsync: Updates.checkForUpdateAsync,
    fetchUpdateAsync: Updates.fetchUpdateAsync,
    reloadAsync: Updates.reloadAsync
};

export function shortenUpdateId(updateId: string): string {
    return updateId.slice(0, 8);
}

export function createAppVersionInfo(input: AppVersionInfoInput): AppVersionInfo {
    const isWeb = input.platform === 'web';
    const updateId = input.runningUpdate.updateId?.trim() || null;
    const configuredChannel = input.runningUpdate.channel?.trim();
    let channel = 'Not configured';
    if (isWeb) channel = 'Browser';
    else if (input.isDevelopment) channel = 'Development';
    if (configuredChannel) channel = configuredChannel;

    let updateLabel = 'Embedded in native build';
    if (isWeb) updateLabel = 'Managed by browser';
    else if (input.isDevelopment) updateLabel = 'Development bundle';
    else if (!input.runningUpdate.isEmbeddedLaunch) {
        updateLabel = updateId ? `OTA ${shortenUpdateId(updateId)}` : 'Downloaded OTA';
    }

    return {
        nativeVersion: isWeb
            ? 'Not applicable'
            : input.nativeApplicationVersion?.trim() || input.fallbackNativeVersion,
        nativeBuild: isWeb
            ? 'Not applicable'
            : input.nativeBuildVersion?.trim() || input.fallbackNativeBuild,
        nativeReleaseTag: isWeb ? 'Not applicable' : input.nativeReleaseTag,
        runtimeVersion: input.runningUpdate.runtimeVersion?.trim() || input.fallbackNativeVersion,
        channel,
        updateId,
        updateLabel,
        updateCreatedAt: input.runningUpdate.createdAt ?? null,
        isEmbeddedLaunch: input.runningUpdate.isEmbeddedLaunch,
        isEmergencyLaunch: input.runningUpdate.isEmergencyLaunch,
        emergencyLaunchReason: input.runningUpdate.emergencyLaunchReason
    };
}

export function getAppVersionInfo(runningUpdate: RunningUpdateInfo): AppVersionInfo {
    return createAppVersionInfo({
        platform: Platform.OS,
        isDevelopment: typeof __DEV__ !== 'undefined' && __DEV__,
        nativeApplicationVersion: Application.nativeApplicationVersion,
        nativeBuildVersion: Application.nativeBuildVersion,
        fallbackNativeVersion: release.android.mobile.version_name,
        fallbackNativeBuild: String(release.android.mobile.version_code),
        nativeReleaseTag: appConfig.expo.extra.calibrate.nativeReleaseTag,
        runningUpdate
    });
}

export function canManageOtaUpdates(platform: string, isDevelopment: boolean, isEnabled: boolean): boolean {
    return platform !== 'web' && !isDevelopment && isEnabled;
}

export async function checkForAppUpdate(
    runtime: Pick<AppUpdateRuntime, 'checkForUpdateAsync'> = appUpdateRuntime
): Promise<AppUpdateCheckOutcome> {
    const result = await runtime.checkForUpdateAsync();
    if (result.isAvailable) return 'available';
    if (result.isRollBackToEmbedded) return 'rollback';
    return 'current';
}

export async function downloadAppUpdate(
    runtime: Pick<AppUpdateRuntime, 'fetchUpdateAsync'> = appUpdateRuntime
): Promise<boolean> {
    const result = await runtime.fetchUpdateAsync();
    return result.isNew || result.isRollBackToEmbedded;
}
