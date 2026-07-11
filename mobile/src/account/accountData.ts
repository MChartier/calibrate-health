import type { AccountExport } from '@calibrate/api-client';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE MY ACCOUNT';
const EXPORT_MIME_TYPE = 'application/json';
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

/** Clears credentials after confirmed server deletion even if local outbox cleanup fails. */
export async function deleteAccountAndClearLocalData(
    currentPassword: string,
    dependencies: AccountDeletionDependencies
): Promise<void> {
    await dependencies.deleteRemoteAccount(currentPassword);
    try {
        await dependencies.discardOfflineChanges();
    } finally {
        await dependencies.clearLocalSession();
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
