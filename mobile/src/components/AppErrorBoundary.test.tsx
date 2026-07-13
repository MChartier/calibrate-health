import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AppErrorBoundary } from './AppErrorBoundary';

const AlwaysThrows = () => {
    throw new Error('Example render failure');
};

describe('AppErrorBoundary', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('shows an accessible branded fallback when a descendant crashes', () => {
        const view = render(
            <AppErrorBoundary>
                <AlwaysThrows />
            </AppErrorBoundary>
        );

        expect(view.getByRole('alert')).toHaveProp(
            'accessibilityLabel',
            'Calibrate encountered an unexpected error'
        );
        expect(view.getByRole('header')).toHaveTextContent('Calibrate hit a snag');
        expect(view.getByLabelText('Calibrate')).toBeTruthy();
        expect(view.getByLabelText('Try loading Calibrate again')).toHaveProp('accessibilityRole', 'button');
        expect(view.getByLabelText('Restart Calibrate')).toHaveProp('accessibilityRole', 'button');
        expect(view.getByTestId('app-error-detail')).toHaveTextContent('Example render failure');
    });

    it('resets and remounts the app subtree without reloading the process', () => {
        let shouldThrow = true;
        const RecoverableChild = () => {
            if (shouldThrow) throw new Error('Recoverable failure');
            return <Text>Recovered app</Text>;
        };
        const view = render(
            <AppErrorBoundary>
                <RecoverableChild />
            </AppErrorBoundary>
        );

        shouldThrow = false;
        fireEvent.press(view.getByLabelText('Try loading Calibrate again'));

        expect(view.getByText('Recovered app')).toBeTruthy();
        expect(view.queryByRole('alert')).toBeNull();
    });

    it('offers a full app restart when resetting is not enough', () => {
        const restartApp = jest.fn();
        const view = render(
            <AppErrorBoundary restartApp={restartApp}>
                <AlwaysThrows />
            </AppErrorBoundary>
        );

        fireEvent.press(view.getByLabelText('Restart Calibrate'));

        expect(restartApp).toHaveBeenCalledTimes(1);
    });
});
