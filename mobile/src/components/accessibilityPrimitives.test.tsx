import React from 'react';
import { render } from '@testing-library/react-native';
import { AppButton } from './AppButton';
import { AppChip } from './AppChip';
import { SectionHeader } from './SectionHeader';
import { TextField } from './TextField';

describe('mobile accessibility primitives', () => {
    it('gives buttons a useful default role, label, and disabled state', () => {
        const { getByRole } = render(<AppButton title="Save meal" disabled />);
        const button = getByRole('button', { name: 'Save meal' });
        expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    });

    it('uses pressed styling without the clipped Android ripple that can hide labels', () => {
        const { getByRole } = render(<AppButton title="Create account" />);

        expect(getByRole('button', { name: 'Create account' }).props.android_ripple).toBeUndefined();
        expect(getByRole('button', { name: 'Create account' })).toHaveStyle({ overflow: 'hidden' });
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
