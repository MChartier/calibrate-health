import { PublicLegalPage } from '../src/components/legal/PublicLegalPage';
import {
    PRIVACY_INTRO,
    PRIVACY_LAST_UPDATED,
    PRIVACY_SECTIONS
} from '../src/legal/publicLegalContent';

export default function PrivacyRoute() {
    return (
        <PublicLegalPage
            title="Privacy policy"
            lastUpdated={PRIVACY_LAST_UPDATED}
            intro={PRIVACY_INTRO}
            sections={PRIVACY_SECTIONS}
            links={[
                { href: '/terms', label: 'Terms of service' },
                { href: '/account-deletion', label: 'Account deletion instructions' },
                { href: '/', label: 'Back to Calibrate' }
            ]}
        />
    );
}
