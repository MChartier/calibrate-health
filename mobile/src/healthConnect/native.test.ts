import { mapSdkStatus } from './native';

describe('Health Connect availability', () => {
    it('maps provider availability into product states', () => {
        expect(mapSdkStatus(3)).toBe('available');
        expect(mapSdkStatus(2)).toBe('provider_update_required');
        expect(mapSdkStatus(1)).toBe('unsupported');
        expect(mapSdkStatus(999)).toBe('unsupported');
    });
});
