import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard, StyleSheet, Text } from 'react-native';
import { AppButton } from './AppButton';
import { AppChip } from './AppChip';
import { SectionHeader } from './SectionHeader';
import { TextField } from './TextField';
import { themes } from '../theme';

describe('mobile accessibility primitives', () => {
    it('gives buttons a useful default role, label, and disabled state', () => {
        const { getByRole } = render(<AppButton title="Save meal" disabled />);
        const button = getByRole('button', { name: 'Save meal' });
        expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    });

    it('keeps a disabled button icon legible on its disabled surface', () => {
        const TestIcon = ({ color }: { color: string }) => <Text testID="button-icon" style={{ color }}>icon</Text>;
        const { getByTestId } = render(
            <AppButton title="Search" disabled leftIcon={<TestIcon color={themes.light.colors.onPrimary} />} />
        );

        expect(StyleSheet.flatten(getByTestId('button-icon').props.style)).toEqual(
            expect.objectContaining({ color: themes.light.colors.onSurfaceVariant })
        );
    });

    it('uses pressed styling without the clipped Android ripple that can hide labels', () => {
        const { getByRole } = render(<AppButton title="Create account" />);

        expect(getByRole('button', { name: 'Create account' }).props.android_ripple).toBeUndefined();
    });

    it('dismisses the keyboard before running a completed action by default', () => {
        const calls: string[] = [];
        const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
            calls.push('dismiss');
        });
        const { getByRole } = render(
            <AppButton title="Save meal" onPress={() => calls.push('press')} />
        );

        fireEvent.press(getByRole('button', { name: 'Save meal' }));

        expect(calls).toEqual(['dismiss', 'press']);
        dismiss.mockRestore();
    });

    it('allows an in-place button action to preserve the keyboard', () => {
        const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());
        const onPress = jest.fn();
        const { getByRole } = render(
            <AppButton
                title="Keep editing"
                dismissKeyboardOnPress={false}
                onPress={onPress}
            />
        );

        fireEvent.press(getByRole('button', { name: 'Keep editing' }));

        expect(dismiss).not.toHaveBeenCalled();
        expect(onPress).toHaveBeenCalledTimes(1);
        dismiss.mockRestore();
    });

    it('uses a text field label as its accessible name even when the visual label is hidden', () => {
        const { getByLabelText } = render(
            <TextField label="Search foods" hideLabel value="" onChangeText={jest.fn()} />
        );
        expect(getByLabelText('Search foods')).toBeTruthy();
    });

    it('preserves explicit accessible names supplied by feature screens', () => {
        const { getByRole, getByLabelText } = render(
            <>
                <AppButton title="Save" accessibilityLabel="Save today's weigh-in" />
                <TextField label="Server" accessibilityLabel="Self-hosted server URL" />
            </>
        );
        expect(getByRole('button', { name: "Save today's weigh-in" })).toBeTruthy();
        expect(getByLabelText('Self-hosted server URL')).toBeTruthy();
    });

    it('uses Android-sized touch targets for shared buttons and chips', () => {
        const { getByRole } = render(
            <>
                <AppButton title="Save" />
                <AppChip label="Breakfast" selected />
            </>
        );

        expect(getByRole('button', { name: 'Save' })).toHaveStyle({ minHeight: 48 });
        expect(getByRole('button', { name: 'Breakfast' })).toHaveStyle({ minHeight: 48 });
        expect(getByRole('button', { name: 'Breakfast' }).props.accessibilityState).toEqual(
            expect.objectContaining({ selected: true })
        );
    });

    it('exposes section titles as level-two headings by default', () => {
        const { getByRole } = render(<SectionHeader title="Preferences" />);

        expect(getByRole('header', { name: 'Preferences' }).props['aria-level']).toBe(2);
    });
});
