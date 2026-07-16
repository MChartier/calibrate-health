import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, CalibrateApiClient } from '../src/client.ts';

type InternalRequest = <T>(
    path: string,
    options?: RequestInit & { auth?: boolean; json?: unknown }
) => Promise<T>;

const getInternalRequest = (client: CalibrateApiClient): InternalRequest =>
    (client as unknown as { request: InternalRequest }).request.bind(client);

const abortError = (): Error => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
};

const createAbortAwareFetch = (): typeof fetch =>
    (async (_input, init) => {
        const signal = init?.signal;
        if (signal?.aborted) throw abortError();

        return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(abortError()), { once: true });
        });
    }) as typeof fetch;

test('request timeout reports a connection timeout rather than a caller abort', async () => {
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: createAbortAwareFetch(),
        requestTimeoutMs: 5
    });

    await assert.rejects(
        () => client.getClientConfig(),
        (error) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /^Request timed out while connecting to https:\/\/calibrate\.example\./);
            assert.notEqual(error.name, 'AbortError');
            return true;
        }
    );
});

test('caller abort remains an AbortError and is not rewritten as a timeout', async () => {
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: createAbortAwareFetch(),
        requestTimeoutMs: 1_000
    });
    const controller = new AbortController();
    const pending = getInternalRequest(client)('/api/client-config', {
        auth: false,
        signal: controller.signal
    });

    controller.abort();

    await assert.rejects(
        () => pending,
        (error) => {
            assert.ok(error instanceof Error);
            assert.equal(error.name, 'AbortError');
            assert.doesNotMatch(error.message, /timed out/i);
            return true;
        }
    );
});

test('a signal aborted before the request reaches fetch is still honored', async () => {
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: createAbortAwareFetch(),
        requestTimeoutMs: 1_000
    });
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        () => getInternalRequest(client)('/api/client-config', { auth: false, signal: controller.signal }),
        (error) => {
            assert.ok(error instanceof Error);
            assert.equal(error.name, 'AbortError');
            return true;
        }
    );
});

for (const responseBody of ['upstream unavailable', '<html><body>Bad gateway</body></html>', '{"message":']) {
    test(`non-JSON error body is retained without masking HTTP status: ${responseBody.slice(0, 20)}`, async () => {
        const client = new CalibrateApiClient({
            baseUrl: 'https://calibrate.example',
            fetchImpl: (async () => new Response(responseBody, { status: 502 })) as typeof fetch
        });

        await assert.rejects(
            () => client.getClientConfig(),
            (error) => {
                assert.ok(error instanceof ApiError);
                assert.equal(error.status, 502);
                assert.equal(error.message, 'Request failed with status 502');
                assert.equal(error.body, responseBody);
                return true;
            }
        );
    });
}

test('one successful refresh retries the original request with the replacement token', async () => {
    const authorizationHeaders: Array<string | null> = [];
    let accessToken = 'expired-token';
    let refreshCalls = 0;
    let unauthorizedCalls = 0;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        getAccessToken: () => accessToken,
        refreshAccessToken: async () => {
            refreshCalls += 1;
            accessToken = 'replacement-token';
            return true;
        },
        onUnauthorized: () => {
            unauthorizedCalls += 1;
        },
        fetchImpl: (async (_input, init) => {
            authorizationHeaders.push(new Headers(init?.headers).get('authorization'));
            if (authorizationHeaders.length === 1) {
                return new Response('{"message":"expired"}', { status: 401 });
            }
            return new Response('{"user":{"id":7}}', { status: 200 });
        }) as typeof fetch
    });

    const result = await client.getMe();

    assert.equal(result.user.id, 7);
    assert.deepEqual(authorizationHeaders, ['Bearer expired-token', 'Bearer replacement-token']);
    assert.equal(refreshCalls, 1);
    assert.equal(unauthorizedCalls, 0);
});

test('a retried 401 does not start another refresh loop', async () => {
    let accessToken = 'expired-token';
    let fetchCalls = 0;
    let refreshCalls = 0;
    let unauthorizedCalls = 0;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        getAccessToken: () => accessToken,
        refreshAccessToken: async () => {
            refreshCalls += 1;
            accessToken = 'replacement-token';
            return true;
        },
        onUnauthorized: () => {
            unauthorizedCalls += 1;
        },
        fetchImpl: (async () => {
            fetchCalls += 1;
            return new Response('{"message":"still unauthorized"}', { status: 401 });
        }) as typeof fetch
    });

    await assert.rejects(
        () => client.getMe(),
        (error) => {
            assert.ok(error instanceof ApiError);
            assert.equal(error.status, 401);
            assert.equal(error.message, 'still unauthorized');
            return true;
        }
    );
    assert.equal(fetchCalls, 2);
    assert.equal(refreshCalls, 1);
    assert.equal(unauthorizedCalls, 1);
});

test('native identity is attached to public and authenticated requests and cannot be overridden', async () => {
    const captured: Headers[] = [];
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        clientIdentity: { platform: 'android_phone', version: '1.2.3' },
        fetchImpl: (async (_input, init) => {
            captured.push(new Headers(init?.headers));
            return new Response('{}', { status: 200 });
        }) as typeof fetch
    });

    await client.getClientConfig();
    await getInternalRequest(client)('/api/user/profile', {
        headers: {
            'x-calibrate-client-platform': 'wear_os',
            'x-calibrate-client-version': '99.0.0'
        }
    });

    assert.equal(captured.length, 2);
    for (const headers of captured) {
        assert.equal(headers.get('x-calibrate-client-platform'), 'android_phone');
        assert.equal(headers.get('x-calibrate-client-version'), '1.2.3');
    }
});

test('browser cookie transport uses session endpoints without native or bearer credentials', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        requestCredentials: 'include',
        fetchImpl: (async (input, init = {}) => {
            requests.push({ url: String(input), init });
            return new Response('{"user":{"id":7}}', { status: 200 });
        }) as typeof fetch
    });

    await client.loginBrowser({ email: 'person@example.com', password: 'secret123' });
    await client.registerBrowser({ email: 'new@example.com', password: 'secret456' });
    await client.getMe();
    await client.logoutBrowser();

    assert.deepEqual(requests.map(({ url }) => url), [
        'https://calibrate.example/auth/login',
        'https://calibrate.example/auth/register',
        'https://calibrate.example/auth/me',
        'https://calibrate.example/auth/logout'
    ]);
    assert.deepEqual(requests.map(({ init }) => init.method), ['POST', 'POST', undefined, 'POST']);
    for (const { init } of requests) {
        const headers = new Headers(init.headers);
        assert.equal(init.credentials, 'include');
        assert.equal(headers.get('authorization'), null);
        assert.equal(headers.get('x-calibrate-client-platform'), null);
        assert.equal(headers.get('x-calibrate-client-version'), null);
    }
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
        email: 'person@example.com',
        password: 'secret123'
    });
});

test('a per-request credential policy overrides the browser client default', async () => {
    let credentials: RequestCredentials | undefined;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        requestCredentials: 'include',
        fetchImpl: (async (_input, init) => {
            credentials = init?.credentials;
            return new Response('{}', { status: 200 });
        }) as typeof fetch
    });

    await getInternalRequest(client)('/api/client-config', {
        auth: false,
        credentials: 'omit'
    });

    assert.equal(credentials, 'omit');
});

test('upgrade-required responses notify the native shell without triggering auth logout', async () => {
    const requirements = [];
    let unauthorizedCalls = 0;
    const body = {
        code: 'CLIENT_UPGRADE_REQUIRED',
        platform: 'android_phone',
        current_version: '0.1.0',
        minimum_supported_version: '0.2.0',
        message: 'Update Calibrate for Android to version 0.2.0 or newer to continue.',
        retryable: false
    };
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        clientIdentity: { platform: 'android_phone', version: '0.1.0' },
        onClientUpgradeRequired: (requirement) => { requirements.push(requirement); },
        onUnauthorized: () => { unauthorizedCalls += 1; },
        fetchImpl: (async () => new Response(JSON.stringify(body), { status: 426 })) as typeof fetch
    });

    await assert.rejects(
        () => client.getUserProfile(),
        (error) => error instanceof ApiError && error.status === 426
    );
    assert.deepEqual(requirements, [body]);
    assert.equal(unauthorizedCalls, 0);
});

test('malformed upgrade bodies cannot inject unbounded compatibility UI content', async () => {
    let notifications = 0;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        clientIdentity: { platform: 'android_phone', version: '0.1.0' },
        onClientUpgradeRequired: () => { notifications += 1; },
        fetchImpl: (async () => new Response(JSON.stringify({
            code: 'CLIENT_UPGRADE_REQUIRED',
            platform: 'android_phone',
            current_version: '0.1.0',
            minimum_supported_version: 'not-semver',
            message: 'x'.repeat(10_000),
            retryable: false
        }), { status: 426 })) as typeof fetch
    });

    await assert.rejects(() => client.getClientConfig(), ApiError);
    assert.equal(notifications, 0);
});
