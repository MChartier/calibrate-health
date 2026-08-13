import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppCard } from './AppCard';
import { AppPressableCard } from './AppPressableCard';
import { AppText } from './AppText';
import { themes } from '../theme';

describe('AppPressableCard', () => {
    it('delegates to the shared full-surface interaction and focus states', () => {
        const screen = render(
            <AppPressableCard accessibilityRole="button" accessibilityLabel="Open card">
                <AppText>Card content</AppText>
            </AppPressableCard>
        );
        const button = screen.getByRole('button', { name: 'Open card' });

        expect(button.props.android_ripple).toBeUndefined();
        fireEvent(button, 'pressIn');

        expect(StyleSheet.flatten(screen.UNSAFE_getByType(AppCard).props.style)).toEqual(expect.objectContaining({
            backgroundColor: themes.light.colors.surfacePressed,
            borderColor: themes.light.colors.outline,
            elevation: 0
        }));

        fireEvent(button, 'pressOut');
        fireEvent(button, 'focus');
        expect(StyleSheet.flatten(screen.UNSAFE_getByType(AppCard).props.style)).toEqual(expect.objectContaining({
            outlineColor: themes.light.colors.focusRing,
            outlineWidth: themes.light.interaction.focusRingWidth
        }));
    });
});
