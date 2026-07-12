import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient } from '../src/client.ts';

type CapturedRequest = { url: string; init: RequestInit };

const createClient = (requests: CapturedRequest[]) => new CalibrateApiClient({
    baseUrl: 'https://self-hosted.example',
    getAccessToken: () => 'wear-access-token',
    fetchImpl: (async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return new Response(JSON.stringify({ revision: 'r1' }), { status: 200 });
    }) as typeof fetch
});

test('watch snapshot uses the versioned restricted surface', async () => {
    const requests: CapturedRequest[] = [];
    const result = await createClient(requests).getWatchSnapshot();
    assert.equal(requests[0]?.url, 'https://self-hosted.example/api/v1/watch');
    assert.equal(new Headers(requests[0]?.init.headers).get('authorization'), 'Bearer wear-access-token');
    assert.equal(result.notModified, false);
    assert.deepEqual(result.body, { revision: 'r1' });
});

test('watch snapshot sends If-None-Match and returns 304 metadata without throwing', async () => {
    const requests: CapturedRequest[] = [];
    const client = new CalibrateApiClient({
        baseUrl: 'https://self-hosted.example',
        getAccessToken: () => 'wear-access-token',
        fetchImpl: (async (input, init) => {
            requests.push({ url: String(input), init: init ?? {} });
            return new Response(null, { status: 304, headers: { etag: 'W/"watch-r1"' } });
        }) as typeof fetch
    });
    const result = await client.getWatchSnapshot('W/"watch-r1"');
    assert.equal(new Headers(requests[0]?.init.headers).get('if-none-match'), 'W/"watch-r1"');
    assert.deepEqual(result, { body: null, etag: 'W/"watch-r1"', notModified: true });
});

test('watch mutation always carries its client operation id', async () => {
    const requests: CapturedRequest[] = [];
    const payload = {
        type: 'metric.upsert' as const,
        payload: { local_date: '2026-07-11', weight_grams: 81234, expected_revision: null }
    };
    await createClient(requests).executeWatchMutation(payload, 'watch-operation-001');
    assert.equal(requests[0]?.url, 'https://self-hosted.example/api/v1/watch/mutations');
    assert.equal(new Headers(requests[0]?.init.headers).get('x-client-operation-id'), 'watch-operation-001');
    assert.equal(requests[0]?.init.body, JSON.stringify(payload));
});
