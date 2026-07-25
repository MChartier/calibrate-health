import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AppText } from './AppText';
import { Screen } from './Screen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

describe('Screen', () => {
    it('exposes the page as a main landmark and preserves view props', () => {
        const view = render(
            <Screen testID="responsive-screen">
                <AppText>Dashboard</AppText>
            </Screen>
        );

        expect(view.getByTestId('responsive-screen')).toHaveProp('role', 'main');
    });

    it('caps wide scroll content at a readable desktop width', () => {
        const view = render(
            <Screen testID="responsive-screen">
                <AppText>Dashboard</AppText>
            </Screen>
        );
        const contentStyle = StyleSheet.flatten(view.getByTestId('responsive-screen').props.contentContainerStyle);

        expect(contentStyle).toEqual(expect.objectContaining({
            minHeight: '100%',
            width: '100%',
            maxWidth: 1040,
            alignSelf: 'center'
        }));
    });

    it('uses FAB clearance instead of stacking it on normal bottom padding', () => {
        const view = render(
            <Screen testID="responsive-screen" reserveBottomTabs>
                <AppText>Dashboard</AppText>
            </Screen>
        );
        const contentStyle = StyleSheet.flatten(view.getByTestId('responsive-screen').props.contentContainerStyle);

        expect(contentStyle.paddingBottom).toBe(88);
    });

    it('uses the shared keyboard-aware scroller for form content', () => {
        const view = render(
            <Screen testID="responsive-screen">
                <AppText>Account form</AppText>
            </Screen>
        );

        const scroller = view.UNSAFE_getByType(ScrollView);
        expect(scroller.props.keyboardDismissMode).toBe('on-drag');
        expect(scroller.props.keyboardShouldPersistTaps).toBe('handled');
    });
});
