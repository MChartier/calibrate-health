import React from 'react';
import { StyleSheet } from 'react-native';
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

        expect(contentStyle).toEqual(expect.objectContaining({ width: '100%', maxWidth: 1040, alignSelf: 'center' }));
    });
});
