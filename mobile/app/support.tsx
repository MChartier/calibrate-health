import { PublicLegalPage } from '../src/components/legal/PublicLegalPage';
import {
    SUPPORT_EMAIL,
    SUPPORT_INTRO,
    SUPPORT_SECTIONS
} from '../src/legal/publicLegalContent';

export default function SupportRoute() {
    return (
        <PublicLegalPage
            title="Support"
            intro={SUPPORT_INTRO}
            sections={SUPPORT_SECTIONS}
            links={[
                { href: `mailto:${SUPPORT_EMAIL}`, label: 'Email support' },
                { href: '/terms', label: 'Terms of service' },
                { href: '/privacy', label: 'Privacy policy' },
                { href: '/account-deletion', label: 'Account deletion' }
            ]}
        />
    );
}
