import { authenticateAgainstConfirmedServer } from './serverSwitch';
import type { ServerConnectionResult } from '../config/server';

const failedConnection: ServerConnectionResult = {
    ok: false,
    url: 'https://new.example',
    code: 'unreachable',
    message: 'Could not connect.'
};

const successfulConnection: ServerConnectionResult = {
    ok: true,
    url: 'https://new.example',
    message: 'Connected.',
    config: {
        api_version: 1,
        api_versions: {
            current: 'v1',
            supported: ['v1'],
            legacy_alias: '/api',
            legacy_deprecation: 'none'
        },
        server_version: '1.0.0',
        hosted_origin: 'https://new.example',
        min_supported_mobile_version: '0.1.0',
        min_supported_wear_version: '0.1.0',
        capabilities: {
            self_hosted_server_url: true,
            native_push: true,
            health_connect_activity: true,
            wear_os_ready: false
        }
    }
};

describe('authenticateAgainstConfirmedServer', () => {
    it('authenticates against the normalized URL returned by confirmation', async () => {
        const events: string[] = [];
        const authenticate = jest.fn(async (confirmedServerUrl: string) => {
            events.push(`authenticated:${confirmedServerUrl}`);
            return 'session';
        });

        const result = await authenticateAgainstConfirmedServer({
            candidate: 'https://new.example/',
            confirmServer: async (candidate) => {
                events.push(`confirmed:${candidate}`);
                return successfulConnection;
            },
            authenticate
        });

        expect(result).toBe('session');
        expect(events).toEqual([
            'confirmed:https://new.example/',
            'authenticated:https://new.example'
        ]);
        expect(authenticate).toHaveBeenCalledWith(successfulConnection.url);
    });

    it('does not send credentials when server confirmation fails', async () => {
        const authenticate = jest.fn(async () => 'session');

        const result = await authenticateAgainstConfirmedServer({
            candidate: 'https://new.example',
            confirmServer: async () => failedConnection,
            authenticate
        });

        expect(result).toBeNull();
        expect(authenticate).not.toHaveBeenCalled();
    });
});
