import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ClientServerIncompatibleScreen } from './ClientServerIncompatibleScreen';

describe('ClientServerIncompatibleScreen', () => {
    it('directs a user to update a lagging server without clearing retained data', () => {
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '0.35.0', serverVersion: '0.34.9', status: 'server_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={jest.fn(async () => false)}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        expect(view.getByRole('header')).toHaveTextContent('Server update required');
        expect(view.getByText(/requires server 0\.35\.x/)).toBeTruthy();
        expect(view.getByText(/pending offline changes remain stored/)).toBeTruthy();
        expect(view.getByText('https://health.example.com')).toBeTruthy();
    });

    it('directs a user to update the client when the server release line is ahead', () => {
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '0.34.9', serverVersion: '0.35.0', status: 'client_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={jest.fn(async () => false)}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        expect(view.getByRole('header')).toHaveTextContent('Calibrate update required');
        expect(view.getByText(/selected server has advanced to 0\.35\.0/)).toBeTruthy();
    });

    it('rechecks the selected server and reports a persistent mismatch', async () => {
        const onRecheck = jest.fn(async () => false);
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '0.35.0', serverVersion: '0.34.9', status: 'server_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={onRecheck}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        fireEvent.press(view.getByLabelText('Check again'));
        await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
        expect(await view.findByText(/still on incompatible release lines/)).toBeTruthy();
    });
});
