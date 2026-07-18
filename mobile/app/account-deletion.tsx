import React from 'react';
import { PublicLegalPage } from '../src/components/legal/PublicLegalPage';
import {
    ACCOUNT_DELETION_INTRO,
    ACCOUNT_DELETION_SECTIONS,
    buildAccountDeletionRequestMailto
} from '../src/legal/publicLegalContent';

export default function AccountDeletionRoute() {
    return (
        <PublicLegalPage
            title="Delete your Calibrate account"
            intro={ACCOUNT_DELETION_INTRO}
            sections={ACCOUNT_DELETION_SECTIONS}
            links={[
                { href: '/(auth)/login', label: 'Sign in to delete now' },
                { href: buildAccountDeletionRequestMailto(), label: 'Email a hosted deletion request' },
                { href: '/privacy', label: 'Read the privacy policy' }
            ]}
        />
    );
}
