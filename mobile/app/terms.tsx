import { PublicLegalPage } from '../src/components/legal/PublicLegalPage';
import {
    TERMS_INTRO,
    TERMS_LAST_UPDATED,
    TERMS_SECTIONS
} from '../src/legal/publicLegalContent';

export default function TermsRoute() {
    return (
        <PublicLegalPage
            title="Terms of service"
            lastUpdated={TERMS_LAST_UPDATED}
            intro={TERMS_INTRO}
            sections={TERMS_SECTIONS}
            links={[
                { href: '/privacy', label: 'Privacy policy' },
                { href: '/support', label: 'Support' },
                { href: '/', label: 'Back to Calibrate' }
            ]}
        />
    );
}
