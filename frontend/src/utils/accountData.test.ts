import { describe, expect, it, vi } from 'vitest';
import {
    canSubmitAccountDeletion,
    DELETE_ACCOUNT_CONFIRMATION,
    downloadAccountExport,
    getAccountDeletionErrorKind,
    getSafeAccountExportFilename
} from './accountData';

describe('web account export', () => {
    it('accepts only the anonymous dated export filename', () => {
        expect(getSafeAccountExportFilename('attachment; filename="calibrate-account-export-2026-07-12.json"'))
            .toBe('calibrate-account-export-2026-07-12.json');
        expect(getSafeAccountExportFilename('attachment; filename="user@example.com.json"'))
            .toBe('calibrate-account-export.json');
        expect(getSafeAccountExportFilename('attachment; filename="../../credentials.json"'))
            .toBe('calibrate-account-export.json');
    });

    it('downloads the response blob and always revokes its temporary URL', async () => {
        const blob = new Blob(['{"format":"calibrate-account-export","version":2}'], { type: 'application/json' });
        const triggerDownload = vi.fn();
        const revokeObjectUrl = vi.fn();

        await downloadAccountExport({
            requestExport: async () => ({
                blob,
                contentDisposition: 'attachment; filename="calibrate-account-export-2026-07-12.json"'
            }),
            createObjectUrl: () => 'blob:calibrate-export',
            revokeObjectUrl,
            triggerDownload
        });

        expect(triggerDownload).toHaveBeenCalledWith(
            'blob:calibrate-export',
            'calibrate-account-export-2026-07-12.json'
        );
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:calibrate-export');
    });

    it('refuses an export containing a credential field before creating a download URL', async () => {
        const createObjectUrl = vi.fn();
        await expect(downloadAccountExport({
            requestExport: async () => ({
                blob: new Blob([
                    '{"format":"calibrate-account-export","version":2,"session_token":"secret"}'
                ], { type: 'application/json' })
            }),
            createObjectUrl,
            revokeObjectUrl: vi.fn(),
            triggerDownload: vi.fn()
        })).rejects.toThrow('credential data');
        expect(createObjectUrl).not.toHaveBeenCalled();
    });
});

describe('web account deletion confirmation', () => {
    it('requires a current password and the exact destructive phrase', () => {
        expect(canSubmitAccountDeletion('current-password', DELETE_ACCOUNT_CONFIRMATION)).toBe(true);
        expect(canSubmitAccountDeletion('', DELETE_ACCOUNT_CONFIRMATION)).toBe(false);
        expect(canSubmitAccountDeletion('current-password', 'delete my account')).toBe(false);
        expect(canSubmitAccountDeletion('current-password', 'DELETE')).toBe(false);
    });

    it('does not distinguish a missing account from generic deletion failures', () => {
        expect(getAccountDeletionErrorKind(400)).toBe('verification');
        expect(getAccountDeletionErrorKind(404)).toBe('generic');
        expect(getAccountDeletionErrorKind(500)).toBe('generic');
        expect(getAccountDeletionErrorKind(undefined)).toBe('generic');
    });
});
