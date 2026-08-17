import { adjustDecimalInput, normalizeDecimalInput, parseDecimalInput } from './numericInput';

describe('numeric input helpers', () => {
    it('accepts a localized decimal separator', () => {
        expect(normalizeDecimalInput('0,125')).toBe('0.125');
        expect(parseDecimalInput('0,125')).toBe(0.125);
    });

    it('preserves keyboard-entered precision when using step buttons', () => {
        expect(adjustDecimalInput({ value: '0.125', delta: 0.25, min: 0.001 })).toBe('0.375');
        expect(adjustDecimalInput({ value: '1.005', delta: 1, min: 0.001 })).toBe('2.005');
    });

    it('avoids floating point artifacts and respects bounds', () => {
        expect(adjustDecimalInput({ value: '0.2', delta: 0.1 })).toBe('0.3');
        expect(adjustDecimalInput({ value: '0.1', delta: -0.25, min: 0.001 })).toBe('0.001');
    });
});
