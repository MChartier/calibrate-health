import { describe, expect, it } from 'vitest';
import { CALIBRATE_PRIVACY_EMAIL } from '../constants/links';
import {
    ACCOUNT_DELETION_COMPLETION_DAYS,
    ACCOUNT_DELETION_RESPONSE_DAYS,
    buildAccountDeletionRequestMailto
} from './accountDeletion';

describe('public account deletion request', () => {
    it('opens a prefilled hosted-service request without embedding an account identifier', () => {
        const requestUrl = buildAccountDeletionRequestMailto();

        expect(requestUrl).toContain(`mailto:${CALIBRATE_PRIVACY_EMAIL}`);
        expect(decodeURIComponent(requestUrl)).toContain('verify that I control the account');
        expect(decodeURIComponent(requestUrl)).toContain('will not send my password');
        expect(requestUrl).not.toContain('email=');
    });

    it('publishes concrete acknowledgement and completion targets', () => {
        expect(ACCOUNT_DELETION_RESPONSE_DAYS).toBe(7);
        expect(ACCOUNT_DELETION_COMPLETION_DAYS).toBe(30);
    });
});
