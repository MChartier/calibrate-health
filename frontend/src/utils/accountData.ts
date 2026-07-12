export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE MY ACCOUNT';
export type AccountDeletionErrorKind = 'verification' | 'generic';

const DEFAULT_EXPORT_FILENAME = 'calibrate-account-export.json';
const SAFE_EXPORT_FILENAME_PATTERN = /^calibrate-account-export-\d{4}-\d{2}-\d{2}\.json$/;
const FORBIDDEN_EXPORT_KEYS = new Set([
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'session_token'
]);

type AccountExportDownloadDependencies = {
    requestExport: () => Promise<{ blob: Blob; contentDisposition?: string }>;
    createObjectUrl: (blob: Blob) => string;
    revokeObjectUrl: (url: string) => void;
    triggerDownload: (url: string, filename: string) => void;
};

export function canSubmitAccountDeletion(currentPassword: string, confirmation: string): boolean {
    return currentPassword.length > 0 && confirmation === DELETE_ACCOUNT_CONFIRMATION;
}

/**
 * Keep missing-account and server details behind a uniform authenticated deletion error.
 */
export function getAccountDeletionErrorKind(status: number | undefined): AccountDeletionErrorKind {
    return status === 400 ? 'verification' : 'generic';
}

/**
 * Accept only the anonymous filename shape emitted by the account export endpoint.
 */
export function getSafeAccountExportFilename(contentDisposition: string | undefined): string {
    const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1]?.trim();
    return filename && SAFE_EXPORT_FILENAME_PATTERN.test(filename) ? filename : DEFAULT_EXPORT_FILENAME;
}

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

async function assertVersionedCredentialFreeExport(blob: Blob): Promise<void> {
    const parsed = JSON.parse(await blob.text()) as { format?: unknown; version?: unknown };
    if (
        parsed.format !== 'calibrate-account-export' ||
        typeof parsed.version !== 'number' ||
        !Number.isInteger(parsed.version) ||
        parsed.version < 1
    ) {
        throw new Error('Account export response was not a supported versioned export.');
    }
    assertNoCredentialFields(parsed, new Set());
}

/**
 * Download the authenticated export through an object URL, then release the in-memory payload.
 */
export async function downloadAccountExport(dependencies: AccountExportDownloadDependencies): Promise<void> {
    const response = await dependencies.requestExport();
    await assertVersionedCredentialFreeExport(response.blob);
    const objectUrl = dependencies.createObjectUrl(response.blob);
    try {
        dependencies.triggerDownload(objectUrl, getSafeAccountExportFilename(response.contentDisposition));
    } finally {
        dependencies.revokeObjectUrl(objectUrl);
    }
}
