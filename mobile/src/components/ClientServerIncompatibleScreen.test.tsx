import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ClientServerIncompatibleScreen } from './ClientServerIncompatibleScreen';

describe('ClientServerIncompatibleScreen', () => {
    it('directs a user to update a lagging server without clearing retained data', () => {
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '2.5.0', serverVersion: '1.99.9', status: 'server_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={jest.fn(async () => false)}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        expect(view.getByRole('header')).toHaveTextContent('Server update required');
        expect(view.getByText(/requires server major version 2\.x/)).toBeTruthy();
        expect(view.getByText(/pending offline changes remain stored/)).toBeTruthy();
        expect(view.getByText('https://health.example.com')).toBeTruthy();
    });

    it('directs a user to update the client when the server major version is ahead', () => {
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '1.99.9', serverVersion: '2.5.0', status: 'client_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={jest.fn(async () => false)}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        expect(view.getByRole('header')).toHaveTextContent('Calibrate update required');
        expect(view.getByText(/Install a Calibrate update for major version 2\.x/)).toBeTruthy();
    });

    it('rechecks the selected server and reports a persistent mismatch', async () => {
        const onRecheck = jest.fn(async () => false);
        const view = render(
            <ClientServerIncompatibleScreen
                mismatch={{ clientVersion: '2.5.0', serverVersion: '1.99.9', status: 'server_behind' }}
                serverUrl="https://health.example.com"
                onRecheck={onRecheck}
                onChooseServer={jest.fn(async () => undefined)}
            />
        );

        fireEvent.press(view.getByLabelText('Check again'));
        await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
        expect(await view.findByText(/still use incompatible major versions/)).toBeTruthy();
    });
});
