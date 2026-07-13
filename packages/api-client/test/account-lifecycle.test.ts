import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient } from '../src/client.ts';

type CapturedRequest = { url: string; init: RequestInit };

const createClient = (requests: CapturedRequest[]): CalibrateApiClient =>
    new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        getAccessToken: () => 'access-token',
        fetchImpl: (async (input, init) => {
            requests.push({ url: String(input), init: init ?? {} });
            const isDelete = init?.method === 'DELETE';
            return new Response(isDelete ? null : JSON.stringify({
                format: 'calibrate-account-export',
                version: 2
            }), {
                status: isDelete ? 204 : 200,
                headers: isDelete ? undefined : { 'content-type': 'application/json' }
            });
        }) as typeof fetch
    });

test('exportAccount requests the versioned authenticated endpoint', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    const result = await client.exportAccount();

    assert.equal(result.format, 'calibrate-account-export');
    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/user/account/export');
    assert.equal(new Headers(requests[0]?.init.headers).get('authorization'), 'Bearer access-token');
});

test('deleteAccount sends the current password and accepts an empty 204 response', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    await client.deleteAccount('correct-password');

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/user/account');
    assert.equal(requests[0]?.init.method, 'DELETE');
    assert.equal(requests[0]?.init.body, JSON.stringify({ current_password: 'correct-password' }));
});
