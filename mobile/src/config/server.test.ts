import {
    getConfiguredServerUrl,
    normalizeServerUrl,
    parseServerUrl,
    resolveDefaultWebServerUrl,
    resolveInitialServerUrl,
    testCalibrateServerConnection
} from './server';

const compatibleConfig = {
    api_version: 1,
    api_versions: {
        current: 'v1',
        supported: ['v1'],
        legacy_alias: '/api',
        legacy_deprecation: 'none'
    },
    server_version: '1.2.3',
    hosted_origin: 'https://calibrate.example',
    min_supported_mobile_version: '0.1.0',
    min_supported_wear_version: '0.1.0',
    capabilities: {
        self_hosted_server_url: true,
        native_push: true,
        health_connect_activity: true,
        wear_os_ready: false
    }
};

describe('server URL parsing', () => {
    it('normalizes hosted origins and defaults scheme-less remote hosts to HTTPS', () => {
        expect(normalizeServerUrl('https://calibratehealth.app/settings')).toBe('https://calibratehealth.app');
        expect(normalizeServerUrl('self-hosted.example:3443/api')).toBe('https://self-hosted.example:3443');
    });

    it('supports Android emulator, localhost, and private LAN HTTP development servers', () => {
        expect(normalizeServerUrl('10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
        expect(normalizeServerUrl('localhost:3000/api')).toBe('http://localhost:3000');
        expect(normalizeServerUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
        expect(normalizeServerUrl('http://192.168.0.160:3000/api')).toBe('http://192.168.0.160:3000');
    });

    it('requires HTTPS for private hosts in release policy', () => {
        const releasePolicy = { allowInsecureLocalHttp: false };
        expect(normalizeServerUrl('http://10.0.2.2:3000', releasePolicy)).toBeNull();
        expect(normalizeServerUrl('http://192.168.0.160:3000', releasePolicy)).toBeNull();
        expect(normalizeServerUrl('192.168.0.160:3443', releasePolicy)).toBe('https://192.168.0.160:3443');
    });

    it('rejects unsafe remote HTTP, credentials, unsupported protocols, and empty input', () => {
        expect(parseServerUrl('http://public.example')).toEqual(expect.objectContaining({ ok: false }));
        expect(parseServerUrl('https://user:secret@calibrate.example')).toEqual(expect.objectContaining({ ok: false }));
        expect(normalizeServerUrl('file:///tmp/calibrate')).toBeNull();
        expect(normalizeServerUrl('')).toBeNull();
    });

    it('reads an optional Expo public server override', () => {
        expect(getConfiguredServerUrl('http://192.168.0.160:3000/api')).toBe('http://192.168.0.160:3000');
        expect(getConfiguredServerUrl('not a url')).toBeNull();
    });

    it('uses an explicit development target instead of a stale stored server', () => {
        expect(resolveInitialServerUrl(
            'https://previous.example',
            'http://10.0.2.2:3329',
            'https://calibratehealth.app',
            true
        )).toBe('http://10.0.2.2:3329');
        expect(resolveInitialServerUrl(
            'https://previous.example',
            'https://build-default.example',
            'https://calibratehealth.app',
            false
        )).toBe('https://previous.example');
    });

    it('targets port 3000 from a loopback Expo dev server but preserves production origins', () => {
        const expoLocation = new URL('http://localhost:8081/login');
        expect(resolveDefaultWebServerUrl(expoLocation, true)).toBe('http://localhost:3000');
        expect(resolveDefaultWebServerUrl(expoLocation, false)).toBe('http://localhost:8081');
        expect(resolveDefaultWebServerUrl(new URL('https://self-hosted.example/app'), true))
            .toBe('https://self-hosted.example');
    });
});

describe('testCalibrateServerConnection', () => {
    it('tests the versioned client-config endpoint and accepts a compatible server', async () => {
        const fetchImpl = jest.fn(async () => new Response(JSON.stringify(compatibleConfig), { status: 200 }));

        const result = await testCalibrateServerConnection('https://calibrate.example', {
            fetchImpl: fetchImpl as typeof fetch,
            mobileVersion: '0.2.0'
        });

        expect(result).toEqual(expect.objectContaining({
            ok: true,
            url: 'https://calibrate.example',
            message: 'Connected to Calibrate 1.2.3 (API v1).'
        }));
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://calibrate.example/api/v1/client-config',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('keeps the global receiver when using the browser fetch implementation', async () => {
        const originalFetch = globalThis.fetch;
        const receiverAwareFetch = jest.fn(function (this: typeof globalThis) {
            if (this !== globalThis) throw new TypeError('Illegal invocation');
            return Promise.resolve(new Response(JSON.stringify(compatibleConfig), { status: 200 }));
        });
        globalThis.fetch = receiverAwareFetch as typeof fetch;

        try {
            const result = await testCalibrateServerConnection('https://calibrate.example');
            expect(result).toEqual(expect.objectContaining({ ok: true }));
            expect(receiverAwareFetch).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('reports unreachable and non-Calibrate servers clearly', async () => {
        const unreachable = await testCalibrateServerConnection('https://offline.example', {
            fetchImpl: jest.fn(async () => { throw new TypeError('Network request failed'); }) as typeof fetch
        });
        expect(unreachable).toEqual(expect.objectContaining({ ok: false, code: 'unreachable' }));

        const wrongServer = await testCalibrateServerConnection('https://files.example', {
            fetchImpl: jest.fn(async () => new Response('<html />', { status: 200 })) as typeof fetch
        });
        expect(wrongServer).toEqual(expect.objectContaining({ ok: false, code: 'not_calibrate' }));
    });

    it('rejects unsupported APIs and mobile versions without switching', async () => {
        const oldApi = {
            ...compatibleConfig,
            api_versions: { ...compatibleConfig.api_versions, supported: ['v2'] }
        };
        const unsupported = await testCalibrateServerConnection('https://future.example', {
            fetchImpl: jest.fn(async () => new Response(JSON.stringify(oldApi), { status: 200 })) as typeof fetch
        });
        expect(unsupported).toEqual(expect.objectContaining({ ok: false, code: 'incompatible' }));

        const upgradeRequired = await testCalibrateServerConnection('https://newer.example', {
            fetchImpl: jest.fn(async () => new Response(JSON.stringify({
                ...compatibleConfig,
                min_supported_mobile_version: '2.0.0'
            }), { status: 200 })) as typeof fetch,
            mobileVersion: '1.9.9'
        });
        expect(upgradeRequired).toEqual(expect.objectContaining({
            ok: false,
            code: 'incompatible',
            message: 'This server requires Calibrate 2.0.0 or newer.'
        }));

        const malformedLocalVersion = await testCalibrateServerConnection('https://newer.example', {
            fetchImpl: jest.fn(async () => new Response(JSON.stringify(compatibleConfig), { status: 200 })) as typeof fetch,
            mobileVersion: 'development'
        });
        expect(malformedLocalVersion).toEqual(expect.objectContaining({ ok: false, code: 'incompatible' }));
    });
});
