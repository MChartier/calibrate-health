import { getKeyboardAvoidingBehavior } from './keyboard';

describe('keyboard avoidance', () => {
    it('lets Android resize its window once and pads iOS layouts around the keyboard', () => {
        expect(getKeyboardAvoidingBehavior('android')).toBeUndefined();
        expect(getKeyboardAvoidingBehavior('ios')).toBe('padding');
        expect(getKeyboardAvoidingBehavior('web')).toBeUndefined();
    });
});
