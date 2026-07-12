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

test('watch snapshot contract exposes unit and revisions needed for offline actions', () => {
    const snapshot: import('../src/types.ts').WatchSnapshot = {
        server_time: '2026-07-11T20:00:00.000Z',
        timezone: 'America/Los_Angeles',
        local_date: '2026-07-11',
        weight_unit: 'LB',
        revision: '0123456789abcdef01234567',
        calories: { consumed: 1200, target: 2000, remaining: 800, missing: [] },
        activity: {
            steps: 7000,
            active_calories_kcal: 300,
            total_calories_kcal: 2200,
            exercise_minutes: 25,
            observed_at: '2026-07-11T18:30:00.000Z'
        },
        food_day: { is_complete: true, completed_at: '2026-07-11T19:00:00.000Z', revision: '111111111111111111111111' },
        weight: {
            today_grams: 80000,
            today_revision: '222222222222222222222222',
            latest_grams: 80000,
            latest_revision: '222222222222222222222222',
            latest_date: '2026-07-11'
        },
        quick_add: [],
        undo_candidate: { food_log_id: 88, name: 'Oats', calories: 300, created_at: '2026-07-11T15:00:00.000Z' },
        staleness: { activity_stale: false, activity_age_seconds: 5400 }
    };

    assert.equal(snapshot.weight_unit, 'LB');
    assert.equal(snapshot.weight.latest_revision, snapshot.weight.today_revision);
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
