import { useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
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
    return <SegmentedControl testID="segmented-control" options={[...OPTIONS]} value={value} onChange={setValue} />;
}

describe('SegmentedControl', () => {
    afterAll(() => {
        Dimensions.set({
            window: { width: 1_024, height: 768, scale: 1, fontScale: 1 },
            screen: { width: 1_024, height: 768, scale: 1, fontScale: 1 }
        });
    });
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

    it('stacks three options at compact width so labels remain whole', () => {
        Dimensions.set({
            window: { width: 320, height: 568, scale: 1, fontScale: 2 },
            screen: { width: 320, height: 568, scale: 1, fontScale: 2 }
        });
        const { getByTestId, getByText } = render(<TestControl />);

        expect(StyleSheet.flatten(getByTestId('segmented-control').props.style)).toEqual(
            expect.objectContaining({ flexDirection: 'column' })
        );
        for (const label of OPTIONS.map((option) => option.label)) {
            expect(getByText(label)).toHaveProp('numberOfLines', 1);
        }
    });
});
