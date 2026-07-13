import type { AccountExport } from '@calibrate/api-client';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AccountDeletionCleanupNotice } from './accountDeletionNotice';

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE MY ACCOUNT';
const EXPORT_MIME_TYPE = 'application/json';
const DEVICE_CLEANUP_TIMEOUT_MS = 10_000;
const FORBIDDEN_EXPORT_KEYS = new Set([
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'session_token'
]);

type ShareFile = {
    uri: string;
    exists: boolean;
    create: (options?: { overwrite?: boolean }) => void;
    write: (content: string) => void;
    delete: () => void;
};

type AccountExportSharingDependencies = {
    isSharingAvailable: () => Promise<boolean>;
    createCacheFile: (filename: string) => ShareFile;
    share: (uri: string, options: { mimeType: string; dialogTitle: string }) => Promise<void>;
};

type AccountDeletionDependencies = {
    deleteRemoteAccount: (currentPassword: string) => Promise<void>;
    discardOfflineChanges: () => Promise<void>;
    clearHealthConnectData: () => Promise<void>;
    clearWearData: () => Promise<void>;
    persistCleanupNotice: (notice: AccountDeletionCleanupNotice) => Promise<void>;
    clearLocalSession: () => Promise<void>;
};

const defaultSharingDependencies: AccountExportSharingDependencies = {
    isSharingAvailable: Sharing.isAvailableAsync,
    createCacheFile: (filename) => new File(Paths.cache, filename),
    share: Sharing.shareAsync
};

function assertNoCredentialFields(value: unknown, seen: Set<object>): void {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
        value.forEach((item) => assertNoCredentialFields(item, seen));
        return;
    }

    Object.entries(value).forEach(([key, nestedValue]) => {
        if (FORBIDDEN_EXPORT_KEYS.has(key.toLowerCase())) {
            throw new Error('Account export unexpectedly contained credential data.');
        }
        assertNoCredentialFields(nestedValue, seen);
    });
}

export function serializeAccountExport(accountExport: AccountExport): string {
    assertNoCredentialFields(accountExport, new Set());
    return JSON.stringify(accountExport, null, 2);
}

export function canSubmitAccountDeletion(currentPassword: string, confirmation: string): boolean {
    return currentPassword.length > 0 && confirmation === DELETE_ACCOUNT_CONFIRMATION;
}

function cleanupNotice(results: PromiseSettledResult<void>[]): AccountDeletionCleanupNotice | null {
    const offlineFailed = results[0]?.status === 'rejected';
    const healthConnectFailed = results[1]?.status === 'rejected';
    const wearResult = results[2];
    const wearFailed = wearResult?.status === 'rejected';
    if (!offlineFailed && !healthConnectFailed && !wearFailed) return null;
    const wearReason = wearResult?.status === 'rejected' ? wearResult.reason : null;
    const unreachableWatch = wearReason instanceof Error && /watch was unreachable/i.test(wearReason.message);
    return {
        version: 1,
        watchCleanupRequired: wearFailed,
        appDataCleanupRequired: offlineFailed || healthConnectFailed || (wearFailed && !unreachableWatch),
        credentialCleanupRequired: false
    };
}

/** Prevent an unavailable platform service from retaining deleted-account credentials indefinitely. */
async function withCleanupTimeout(cleanup: () => Promise<void>): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            Promise.resolve().then(cleanup),
            new Promise<void>((_resolve, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error('Device cleanup timed out.')),
                    DEVICE_CLEANUP_TIMEOUT_MS
                );
            })
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

/** Attempts every account-scoped cleanup and always clears credentials after confirmed server deletion. */
export async function deleteAccountAndClearLocalData(
    currentPassword: string,
    dependencies: AccountDeletionDependencies
): Promise<void> {
    await Promise.resolve().then(() => dependencies.deleteRemoteAccount(currentPassword));
    const cleanupResults = await Promise.allSettled([
        withCleanupTimeout(dependencies.discardOfflineChanges),
        withCleanupTimeout(dependencies.clearHealthConnectData),
        withCleanupTimeout(dependencies.clearWearData)
    ]);
    const notice = cleanupNotice(cleanupResults);
    if (notice) {
        await Promise.resolve().then(() => dependencies.persistCleanupNotice(notice)).catch(() => undefined);
    }

    const sessionResult = await Promise.allSettled([
        withCleanupTimeout(dependencies.clearLocalSession)
    ]);
    if (sessionResult[0].status === 'rejected') {
        await Promise.resolve().then(() => dependencies.persistCleanupNotice({
            version: 1,
            watchCleanupRequired: notice?.watchCleanupRequired ?? false,
            appDataCleanupRequired: true,
            credentialCleanupRequired: true
        })).catch(() => undefined);
        throw new Error('Account deleted, but local sign-in credentials could not be cleared. Clear Calibrate app data now.');
    }
}

function buildExportFilename(exportedAt: string): string {
    const parsed = new Date(exportedAt);
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return `calibrate-account-export-${date.toISOString().slice(0, 10)}.json`;
}

/** Shares a short-lived cache file and removes it whether sharing succeeds or fails. */
export async function shareAccountExport(
    accountExport: AccountExport,
    dependencies: AccountExportSharingDependencies = defaultSharingDependencies
): Promise<void> {
    if (!(await dependencies.isSharingAvailable())) {
        throw new Error('File sharing is unavailable on this device.');
    }

    const file = dependencies.createCacheFile(buildExportFilename(accountExport.exported_at));
    try {
        file.create({ overwrite: true });
        file.write(serializeAccountExport(accountExport));
        await dependencies.share(file.uri, {
            mimeType: EXPORT_MIME_TYPE,
            dialogTitle: 'Share calibrate account export'
        });
    } finally {
        if (file.exists) file.delete();
    }
}
