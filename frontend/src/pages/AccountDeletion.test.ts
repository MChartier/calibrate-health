import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./AccountDeletion.tsx', import.meta.url), 'utf8');

describe('account deletion public resource', () => {
    it('registers a stable route outside the guest-only auth gate', () => {
        const deletionRouteIndex = appSource.indexOf('path="account-deletion"');
        const publicRouteGateIndex = appSource.indexOf('<Route element={<PublicRoute />}');

        expect(deletionRouteIndex).toBeGreaterThan(-1);
        expect(publicRouteGateIndex).toBeGreaterThan(deletionRouteIndex);
    });

    it('keeps the Play-facing deletion and retention disclosures on the public page', () => {
        expect(pageSource).toContain('Delete immediately while signed in');
        expect(pageSource).toContain('Request hosted-service deletion without the app');
        expect(pageSource).toContain('Data deleted with the account');
        expect(pageSource).toContain('Data that may remain temporarily');
        expect(pageSource).toContain('Self-hosted Calibrate instances');
        expect(pageSource).toContain('do not');
        expect(pageSource).toContain('whether an email address belongs to a Calibrate account');
        expect(pageSource).toContain('to="/privacy"');
        expect(pageSource).toContain('to="/login"');
    });
});
