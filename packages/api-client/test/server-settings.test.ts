import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient, ApiError } from '../src/client.ts';
import type { ServerUser } from '../src/types.ts';

const user: ServerUser = {
    id: 7, email: 'member@example.com', role: 'member',
    created_at: '2026-01-01T00:00:00.000Z', email_verified: true
};

test('admin directory encodes bounded search parameters and sends authenticated no-store requests', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const controller = new AbortController();
    const client = new CalibrateApiClient({
        baseUrl: 'https://selfhost.example',
        getAccessToken: async () => 'test-token',
        fetchImpl: (async (url, init) => {
            requests.push({ url: String(url), init });
            return new Response(JSON.stringify({ users: [user], next_cursor: 7 }), { status: 200 });
        }) as typeof fetch
    });
    const page = await client.getServerUsers({ search: 'member+test@example.com', cursor: 2, limit: 25 }, controller.signal);
    assert.deepEqual(page, { users: [user], next_cursor: 7 });
    assert.equal(requests[0].url, 'https://selfhost.example/api/v1/server-settings/users?search=member%2Btest%40example.com&cursor=2&limit=25');
    assert.equal(requests[0].init?.cache, 'no-store');
    assert.equal(new Headers(requests[0].init?.headers).get('authorization'), 'Bearer test-token');
    assert.ok(requests[0].init?.signal instanceof AbortSignal);
    await client.getServerUsers();
    assert.equal(requests[1].url, 'https://selfhost.example/api/v1/server-settings/users');
});

test('role changes send only the intended role and preserve structured safety errors', async () => {
    let init: RequestInit | undefined;
    let reject = false;
    const client = new CalibrateApiClient({
        baseUrl: 'https://selfhost.example',
        fetchImpl: (async (url, options) => {
            assert.equal(String(url), 'https://selfhost.example/api/v1/server-settings/users/7/role');
            init = options;
            return new Response(JSON.stringify(reject
                ? { code: 'LAST_ADMIN_REQUIRED', message: 'Add another verified administrator first.', retryable: false }
                : { user: { ...user, role: 'admin' } }), { status: reject ? 409 : 200 });
        }) as typeof fetch
    });
    assert.equal((await client.updateServerUserRole(7, 'admin')).user.role, 'admin');
    assert.equal(init?.method, 'PATCH');
    assert.equal(init?.cache, 'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)), { role: 'admin' });
    reject = true;
    await assert.rejects(client.updateServerUserRole(7, 'member'), (error: unknown) =>
        error instanceof ApiError && error.status === 409 && error.code === 'LAST_ADMIN_REQUIRED');
});

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
};

for (const operation of ['role', 'features'] as const) {
    test(`aborted ${operation} mutation does not refresh/retry a late 401 with another identity`, async () => {
        const response = deferred<Response>();
        const started = deferred<void>();
        const controller = new AbortController();
        let fetches = 0;
        let refreshes = 0;
        let unauthorized = 0;
        const client = new CalibrateApiClient({
            baseUrl: 'https://old-server.example',
            getAccessToken: () => 'old-account-token',
            refreshAccessToken: () => { refreshes++; return true; },
            onUnauthorized: () => { unauthorized++; },
            fetchImpl: (async () => { fetches++; started.resolve(); return response.promise; }) as typeof fetch
        });
        const pending = operation === 'role'
            ? client.updateServerUserRole(7, 'admin', controller.signal)
            : client.updateServerSettings({ nutrition_label_scanning: true }, controller.signal);
        await started.promise;
        controller.abort();
        response.resolve(new Response('{"message":"Expired"}', { status: 401 }));
        await assert.rejects(pending, { name: 'AbortError' });
        assert.equal(fetches, 1);
        assert.equal(refreshes, 0);
        assert.equal(unauthorized, 0);
    });
}

test('aborting during shared token refresh prevents role-mutation replay and unauthorized callbacks', async () => {
    const refresh = deferred<boolean>();
    const refreshStarted = deferred<void>();
    const controller = new AbortController();
    let fetches = 0;
    let unauthorized = 0;
    const client = new CalibrateApiClient({
        baseUrl: 'https://old-server.example',
        getAccessToken: () => 'old-account-token',
        refreshAccessToken: () => { refreshStarted.resolve(); return refresh.promise; },
        onUnauthorized: () => { unauthorized++; },
        fetchImpl: (async () => { fetches++; return new Response('{}', { status: 401 }); }) as typeof fetch
    });
    const pending = client.updateServerUserRole(7, 'admin', controller.signal);
    await refreshStarted.promise;
    controller.abort();
    refresh.resolve(true);
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(fetches, 1);
    assert.equal(unauthorized, 0);
});

test('pre-aborted mutation does not request credentials or contact a server', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new CalibrateApiClient({
        baseUrl: 'https://old-server.example',
        getAccessToken: () => { assert.fail('No token read is allowed'); },
        fetchImpl: (async () => { assert.fail('No request is allowed'); }) as typeof fetch
    });
    await assert.rejects(client.updateServerUserRole(7, 'admin', controller.signal), { name: 'AbortError' });
});
