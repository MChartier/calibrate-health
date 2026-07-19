import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SegmentedControl } from './SegmentedControl';
import { themes } from '../theme';

const OPTIONS = [
    { value: 'quick', label: 'Quick' },
    { value: 'search', label: 'Search' },
    { value: 'recipes', label: 'Recipes' }
] as const;

function TestControl() {
    const [value, setValue] = useState<(typeof OPTIONS)[number]['value']>('quick');
    return <SegmentedControl options={[...OPTIONS]} value={value} onChange={setValue} />;
}

describe('SegmentedControl', () => {
    it('keeps previously selected labels visible when the selection changes', () => {
        const { getByRole, getByText } = render(<TestControl />);

        fireEvent.press(getByRole('radio', { name: 'Search' }));
        expect(StyleSheet.flatten(getByText('Quick').props.style)).toEqual(
            expect.objectContaining({ color: themes.light.colors.onSurfaceVariant })
        );

        fireEvent.press(getByRole('radio', { name: 'Recipes' }));
        expect(StyleSheet.flatten(getByText('Search').props.style)).toEqual(
            expect.objectContaining({ color: themes.light.colors.onSurfaceVariant })
        );

        expect(getByRole('radio', { name: 'Recipes' }).props.accessibilityState).toEqual(
            expect.objectContaining({ checked: true })
        );
        expect(getByText('Quick')).toBeTruthy();
        expect(getByText('Search')).toBeTruthy();
        expect(getByText('Recipes')).toBeTruthy();
    });
});
