import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppCard } from './AppCard';
import { AppPressableCard } from './AppPressableCard';
import { AppText } from './AppText';
import { themes } from '../theme';

describe('AppPressableCard', () => {
    it('uses a rounded surface state instead of a native Android ripple', () => {
        const screen = render(
            <AppPressableCard testOnly_pressed accessibilityRole="button" accessibilityLabel="Open card">
                <AppText>Card content</AppText>
            </AppPressableCard>
        );
        const button = screen.getByRole('button', { name: 'Open card' });

        expect(button.props.android_ripple).toBeUndefined();

        const pressableStyle = StyleSheet.flatten(button.props.style);
        const cardStyle = StyleSheet.flatten(screen.UNSAFE_getByType(AppCard).props.style);
        expect(pressableStyle).toEqual(expect.objectContaining({
            borderRadius: themes.light.radius.lg,
            transform: [{ translateY: 1 }]
        }));
        expect(cardStyle).toEqual(expect.objectContaining({
            backgroundColor: themes.light.colors.surfacePressed,
            elevation: 0
        }));
    });
});
