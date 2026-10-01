import { ApiError } from '@calibrate/api-client';
import { getAuthActionErrorMessage, getErrorPresentation, getSafeActionErrorMessage } from './presentation';

describe('privacy-safe error presentation', () => {
    it('never relays server, provider, SQL, or stack text', () => {
        for (const raw of [
            'FatSecret token rejected',
            'SELECT password_hash FROM users',
            'Error: boom\n    at private/service.ts:12'
        ]) {
            const error = new ApiError(raw, 500, {
                message: raw,
                code: 'SERVER_ERROR',
                retryable: true,
                request_id: 'safe-reference'
            });
            const presentation = getErrorPresentation(error, 'saved foods');
            expect(`${presentation.title} ${presentation.message}`).not.toContain(raw);
            expect(presentation.requestId).toBe('safe-reference');
            expect(getSafeActionErrorMessage(error, 'Unable to save.')).toBe('Unable to save.');
        }
    });

    it('maps network and authorization failures to actionable bounded copy', () => {
        expect(getErrorPresentation(new TypeError('Network request failed'), 'progress').message)
            .toMatch(/connection/i);
        expect(getErrorPresentation(new ApiError('raw', 403, null), 'profile').message)
            .toMatch(/does not have access/i);
    });
    it('explains retained signup and last-admin deletion recovery without raw server details', () => {
        const retained = new ApiError('Private SMTP exception', 503, { code: 'ACCOUNT_CREATED_EMAIL_DELIVERY_UNAVAILABLE' });
        expect(getAuthActionErrorMessage(retained, 'create account')).toMatch(/Your account was created.*Sign in/);
        const removed = new ApiError('Private SMTP exception', 503, { code: 'EMAIL_DELIVERY_UNAVAILABLE' });
        expect(getAuthActionErrorMessage(removed, 'create account')).not.toContain('was created');
        const lastAdmin = new ApiError('Private admin data', 409, { code: 'LAST_ADMIN_REQUIRED' });
        expect(getSafeActionErrorMessage(lastAdmin, 'Unable to delete.')).toBe('Make another verified member an administrator in Server administration before deleting this account.');
    });

});
