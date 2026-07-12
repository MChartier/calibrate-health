const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
        removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); })
    }
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'generated-request') }));
jest.mock('@calibrate/wear-pairing', () => ({ __esModule: true, default: null }));

import {
    parsePairingHello,
    processWearPairingInbox,
    readStoredWearPairing,
    startWearPairing,
    WEAR_PAIRING_PATHS
} from './pairing';

const ORIGIN = 'https://health.example';
const USER_ID = 7;
const NOW = new Date('2026-07-11T20:00:00.000Z');
const EXPIRES_AT = '2026-07-11T20:05:00.000Z';

function makeTransport(messages: Array<{
    id: string;
    nodeId: string;
    path: string;
    payload: string;
    receivedAt: number;
}> = []) {
    return {
        getPairingNodes: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(1),
        acknowledgeMessages: jest.fn(),
        listMessages: jest.fn(() => messages)
    };
}

function helloPayload(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        request_id: 'request-1',
        protocol_version: 1,
        server_origin: ORIGIN,
        expires_at: EXPIRES_AT,
        watch_device_id: 'watch-1',
        watch_device_name: 'Galaxy Watch Ultra',
        watch_public_key_spki: 'public-key',
        ...overrides
    });
}

async function beginPairing(transport = makeTransport()) {
    await startWearPairing({
        node: { id: 'node-1', displayName: 'Galaxy Watch Ultra', isNearby: true },
        serverOrigin: ORIGIN,
        userId: USER_ID,
        transport,
        now: NOW,
        requestId: 'request-1'
    });
    return transport;
}

describe('Wear phone pairing coordinator', () => {
    beforeEach(() => {
        mockStorage.clear();
        jest.clearAllMocks();
    });

    it('validates the server-bound, expiring watch hello contract', () => {
        expect(parsePairingHello(helloPayload())).toEqual({
            requestId: 'request-1',
            serverOrigin: ORIGIN,
            expiresAt: EXPIRES_AT,
            watchDeviceId: 'watch-1',
            watchDeviceName: 'Galaxy Watch Ultra',
            watchPublicKeySpki: 'public-key'
        });
        expect(parsePairingHello(helloPayload({ protocol_version: 2 }))).toBeNull();
        expect(parsePairingHello(helloPayload({ server_origin: `${ORIGIN}/path` }))).toBeNull();
        expect(parsePairingHello(helloPayload({ watch_device_name: '' }))).toBeNull();
    });

    it('persists a phone-owned invite before contacting the selected node', async () => {
        const transport = await beginPairing();

        expect(transport.sendMessage).toHaveBeenCalledWith(
            'node-1',
            WEAR_PAIRING_PATHS.HELLO,
            expect.stringContaining('"request_id":"request-1"')
        );
        expect([...mockStorage.values()].some((value) => value.includes('"userId":7'))).toBe(true);
    });

    it('removes the pending invite when sending it fails', async () => {
        const transport = makeTransport();
        transport.sendMessage.mockRejectedValueOnce(new Error('Watch unavailable'));

        await expect(beginPairing(transport)).rejects.toThrow('Watch unavailable');
        expect(mockStorage.size).toBe(0);
    });

    it('exchanges only a one-time server credential with the correlated node', async () => {
        const transport = await beginPairing();
        transport.listMessages.mockReturnValue([{
            id: 'message-1',
            nodeId: 'node-1',
            path: WEAR_PAIRING_PATHS.HELLO,
            payload: helloPayload(),
            receivedAt: NOW.getTime()
        }]);
        const issueWearPairingCredential = jest.fn().mockResolvedValue({
            pairing_token: 'one-time-token',
            server_origin: ORIGIN,
            watch_device_id: 'watch-1',
            protocol_version: 1,
            challenge: 'challenge',
            expires_at: EXPIRES_AT
        });

        const result = await processWearPairingInbox({
            api: { issueWearPairingCredential },
            serverOrigin: ORIGIN,
            userId: USER_ID,
            transport,
            now: NOW
        });

        expect(issueWearPairingCredential).toHaveBeenCalledWith(expect.objectContaining({
            server_origin: ORIGIN,
            watch_device_id: 'watch-1'
        }));
        expect(transport.sendMessage).toHaveBeenLastCalledWith(
            'node-1',
            WEAR_PAIRING_PATHS.CREDENTIAL,
            expect.not.stringContaining('refresh_token')
        );
        expect(result).toEqual({ processed: 1, paired: null, errors: [] });
        expect(transport.acknowledgeMessages).toHaveBeenCalledWith(['message-1']);
    });

    it.each([
        ['different node', 'node-2', helloPayload()],
        ['different server', 'node-1', helloPayload({ server_origin: 'https://other.example' })],
        ['different expiry', 'node-1', helloPayload({ expires_at: '2026-07-11T20:04:00.000Z' })]
    ])('rejects a %s hello without issuing a credential', async (_label, nodeId, payload) => {
        const transport = await beginPairing();
        transport.listMessages.mockReturnValue([{
            id: 'mismatch', nodeId, path: WEAR_PAIRING_PATHS.HELLO, payload, receivedAt: NOW.getTime()
        }]);
        const issueWearPairingCredential = jest.fn();

        const result = await processWearPairingInbox({
            api: { issueWearPairingCredential }, serverOrigin: ORIGIN, userId: USER_ID, transport, now: NOW
        });

        expect(issueWearPairingCredential).not.toHaveBeenCalled();
        expect(result.errors).toHaveLength(1);
        expect(transport.acknowledgeMessages).toHaveBeenCalledWith(['mismatch']);
    });

    it('retains a hello when the server credential request fails', async () => {
        const transport = await beginPairing();
        transport.listMessages.mockReturnValue([{
            id: 'message-1', nodeId: 'node-1', path: WEAR_PAIRING_PATHS.HELLO,
            payload: helloPayload(), receivedAt: NOW.getTime()
        }]);
        const result = await processWearPairingInbox({
            api: { issueWearPairingCredential: jest.fn().mockRejectedValue(new Error('Server unavailable')) },
            serverOrigin: ORIGIN,
            userId: USER_ID,
            transport,
            now: NOW
        });

        expect(result.errors).toEqual(['Server unavailable']);
        expect(transport.acknowledgeMessages).toHaveBeenCalledWith([]);
    });

    it('correlates a successful result and stores it only for that account', async () => {
        const transport = await beginPairing();
        transport.listMessages.mockReturnValueOnce([{
            id: 'hello', nodeId: 'node-1', path: WEAR_PAIRING_PATHS.HELLO,
            payload: helloPayload(), receivedAt: NOW.getTime()
        }]);
        await processWearPairingInbox({
            api: { issueWearPairingCredential: jest.fn().mockResolvedValue({ pairing_token: 'token' }) },
            serverOrigin: ORIGIN, userId: USER_ID, transport, now: NOW
        });
        transport.listMessages.mockReturnValueOnce([{
            id: 'result', nodeId: 'node-1', path: WEAR_PAIRING_PATHS.RESULT,
            payload: JSON.stringify({
                ok: true,
                request_id: 'request-1',
                protocol_version: 1,
                server_origin: ORIGIN,
                watch_device_id: 'watch-1',
                watch_device_name: 'Galaxy Watch Ultra'
            }),
            receivedAt: NOW.getTime()
        }]);

        const result = await processWearPairingInbox({
            api: { issueWearPairingCredential: jest.fn() },
            serverOrigin: ORIGIN, userId: USER_ID, transport, now: NOW
        });

        expect(result.paired?.watchDeviceId).toBe('watch-1');
        expect(await readStoredWearPairing(ORIGIN, USER_ID)).toEqual(result.paired);
        expect(await readStoredWearPairing(ORIGIN, USER_ID + 1)).toBeNull();
        expect(transport.acknowledgeMessages).toHaveBeenLastCalledWith(['result']);
    });
});
