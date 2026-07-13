import { getConfiguredServerUrl, normalizeServerUrl } from './server';

describe('normalizeServerUrl', () => {
    it('normalizes valid hosted and local server origins', () => {
        expect(normalizeServerUrl('https://calibratehealth.app/settings')).toBe('https://calibratehealth.app');
        expect(normalizeServerUrl('http://10.0.2.2:3000/')).toBe('http://10.0.2.2:3000');
    });

    it('rejects unsupported protocols and empty input', () => {
        expect(normalizeServerUrl('')).toBeNull();
        expect(normalizeServerUrl('file:///tmp/calibrate')).toBeNull();
    });

    it('reads an optional Expo public server override', () => {
        expect(getConfiguredServerUrl('http://192.168.0.160:3000/api')).toBe('http://192.168.0.160:3000');
        expect(getConfiguredServerUrl('not a url')).toBeNull();
    });
});
