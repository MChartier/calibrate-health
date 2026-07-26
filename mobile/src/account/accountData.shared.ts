import type { AccountExport } from '@calibrate/api-client';
import type { AccountDeletionCleanupNotice } from './accountDeletionNotice';

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE MY ACCOUNT';
export const ACCOUNT_EXPORT_MIME_TYPE = 'application/json';

const FORBIDDEN_EXPORT_KEYS = new Set([
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'session_token'
]);

export type AccountDeletionDependencies = {
    deleteRemoteAccount: (currentPassword: string) => Promise<void>;
    discardOfflineChanges: () => Promise<void>;
    clearHealthConnectData: () => Promise<void>;
    clearWearData: () => Promise<void>;
    persistCleanupNotice: (notice: AccountDeletionCleanupNotice) => Promise<void>;
    clearLocalSession: () => Promise<void>;
};

function assertNoCredentialFields(value: unknown, seen: Set<object>): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
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

/** Serialize only after recursively verifying that the server response contains no credentials. */
export function serializeAccountExport(accountExport: AccountExport): string {
    assertNoCredentialFields(accountExport, new Set());
    return JSON.stringify(accountExport, null, 2);
}

export function canSubmitAccountDeletion(currentPassword: string, confirmation: string): boolean {
    return currentPassword.length > 0 && confirmation === DELETE_ACCOUNT_CONFIRMATION;
}

export function buildAccountExportFilename(exportedAt: string): string {
    const parsed = new Date(exportedAt);
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return `calibrate-account-export-${date.toISOString().slice(0, 10)}.json`;
}
