import { getContentExpansion, interpolateResponsiveValue } from './useResponsiveContentLayout';

describe('responsive content layout', () => {
    it('keeps short viewports compact and fully expands tall viewports', () => {
        expect(getContentExpansion(667, 1)).toBe(0);
        expect(getContentExpansion(800, 1)).toBe(0.5);
        expect(getContentExpansion(932, 1)).toBe(1);
    });

    it('reserves vertical room for larger accessibility text', () => {
        expect(getContentExpansion(900, 1.5)).toBe(0);
    });

    it('interpolates bounded visualization sizes', () => {
        expect(interpolateResponsiveValue(112, 176, 0.5)).toBe(144);
        expect(interpolateResponsiveValue(112, 176, -1)).toBe(112);
        expect(interpolateResponsiveValue(112, 176, 2)).toBe(176);
    });
});
