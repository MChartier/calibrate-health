/**
 * Defines the terms Expo Router screen.
 */
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { PublicLegalPage } from '../src/components/legal/PublicLegalPage';
import {
    TERMS_INTRO,
    TERMS_LAST_UPDATED,
    TERMS_SECTIONS
} from '../src/legal/publicLegalContent';

/** Render the terms route interface. */
export default function TermsRoute() {
    return (
        <PublicLegalPage
            title="Terms of service"
            lastUpdated={TERMS_LAST_UPDATED}
            intro={TERMS_INTRO}
            sections={TERMS_SECTIONS}
            links={[
                { href: CALIBRATE_PRODUCT_LINKS.privacy, label: 'Privacy policy' },
                { href: CALIBRATE_PRODUCT_LINKS.support, label: 'Support' },
                { href: '/', label: 'Back to Calibrate' }
            ]}
        />
    );
}
