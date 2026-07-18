import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthBrand } from './AuthBrand';

describe('AuthBrand', () => {
    it('renders the gauge wordmark and screen-specific supporting copy', () => {
        const screen = render(<AuthBrand description="Your Calibrate history, on your server." />);

        expect(screen.getByText('Calibrate Health')).toBeTruthy();
        expect(screen.getByText('calibrate')).toBeTruthy();
        expect(screen.getByText('Your Calibrate history, on your server.')).toBeTruthy();
        expect(screen.getByLabelText('calibrate')).toBeTruthy();
        expect(screen.getByRole('header', { name: 'calibrate' }).props['aria-level']).toBe(1);
    });
});
