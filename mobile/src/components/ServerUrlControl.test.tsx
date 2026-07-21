import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ServerUrlControl } from './ServerUrlControl';
import { HOSTED_SERVER_URL, type ServerConnectionState } from '../config/server';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const idleConnection: ServerConnectionState = {
    status: 'idle',
    testedInput: null,
    testedUrl: null,
    message: 'Test the connection before signing in.'
};

describe('ServerUrlControl', () => {
    it('expands self-hosted controls and invokes an explicit connection test', () => {
        const onTestConnection = jest.fn(async () => true);
        const view = render(
            <ServerUrlControl
                value="http://10.0.2.2:3000"
                onChangeText={jest.fn()}
                connection={idleConnection}
                onTestConnection={onTestConnection}
            />
        );

        fireEvent.press(view.getByLabelText('Change server URL'));
        fireEvent.press(view.getByLabelText('Test Calibrate server connection'));

        expect(view.getByLabelText('Server URL')).toHaveProp('keyboardType', 'url');
        expect(
            view.getByText('Release builds require HTTPS. Local HTTP is limited to development builds.')
        ).toBeTruthy();
        expect(onTestConnection).toHaveBeenCalledWith('http://10.0.2.2:3000');
    });

    it('announces the confirmed compatibility result for the current candidate', () => {
        const connected: ServerConnectionState = {
            status: 'connected',
            testedInput: 'https://self-hosted.example',
            testedUrl: 'https://self-hosted.example',
            message: 'Connected to Calibrate 1.2.3 (API v1).'
        };
        const view = render(
            <ServerUrlControl
                value="https://self-hosted.example/path"
                onChangeText={jest.fn()}
                connection={connected}
                onTestConnection={jest.fn(async () => true)}
            />
        );

        expect(view.getByLabelText(connected.message)).toHaveProp('accessibilityLiveRegion', 'polite');
        expect(view.getByText(connected.message)).toBeTruthy();
    });

    it('does not show a stale success after the candidate changes and can restore hosted service', () => {
        const onChangeText = jest.fn();
        const connected: ServerConnectionState = {
            status: 'connected',
            testedInput: 'https://old.example',
            testedUrl: 'https://old.example',
            message: 'Connected to Calibrate 1.2.3 (API v1).'
        };
        const view = render(
            <ServerUrlControl
                value="https://new.example"
                onChangeText={onChangeText}
                connection={connected}
                onTestConnection={jest.fn(async () => true)}
            />
        );

        expect(view.queryByText(connected.message)).toBeNull();
        expect(view.getByText('Test this address before signing in.')).toBeTruthy();

        fireEvent.press(view.getByLabelText('Change server URL'));
        fireEvent.press(view.getByLabelText('Use hosted Calibrate server'));
        expect(onChangeText).toHaveBeenCalledWith(HOSTED_SERVER_URL);
    });
});
