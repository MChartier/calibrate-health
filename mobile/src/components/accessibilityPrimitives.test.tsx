import React from 'react';
import { render } from '@testing-library/react-native';
import { AppButton } from './AppButton';
import { TextField } from './TextField';

describe('mobile accessibility primitives', () => {
    it('gives buttons a useful default role, label, and disabled state', () => {
        const { getByRole } = render(<AppButton title="Save meal" disabled />);
        const button = getByRole('button', { name: 'Save meal' });
        expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
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
});
