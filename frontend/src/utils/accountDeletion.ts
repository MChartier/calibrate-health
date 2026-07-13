import { CALIBRATE_PRIVACY_EMAIL } from '../constants/links';

export const ACCOUNT_DELETION_RESPONSE_DAYS = 7;
export const ACCOUNT_DELETION_COMPLETION_DAYS = 30;

/**
 * Build the hosted-service deletion request without collecting account identifiers on a public page.
 */
export function buildAccountDeletionRequestMailto(): string {
    const subject = 'Calibrate hosted account deletion request';
    const body = [
        'Please delete my Calibrate hosted-service account.',
        '',
        'I understand that Calibrate will verify that I control the account before acting.',
        'I will not send my password by email.'
    ].join('\n');

    return `mailto:${CALIBRATE_PRIVACY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
