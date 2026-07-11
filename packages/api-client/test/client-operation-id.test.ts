import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient } from '../src/client.ts';

type CapturedRequest = {
    url: string;
    init: RequestInit;
};

const createClient = (requests: CapturedRequest[]): CalibrateApiClient =>
    new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: (async (input, init) => {
            requests.push({ url: String(input), init: init ?? {} });
            return new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }) as typeof fetch
    });

const getOperationId = (request: CapturedRequest): string | null =>
    new Headers(request.init.headers).get('x-client-operation-id');

test('createFoodLog sends the caller operation ID', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    await client.createFoodLog(
        {
            name: 'Apple',
            calories: 95,
            meal_period: 'BREAKFAST',
            date: '2026-07-11'
        },
        'food-operation-1'
    );

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/food');
    assert.equal(getOperationId(requests[0]), 'food-operation-1');
});

test('addMetric sends the caller operation ID for metric upserts', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    await client.addMetric({ weight: 82.5, date: '2026-07-11' }, 'metric-operation-1');

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/metrics');
    assert.equal(getOperationId(requests[0]), 'metric-operation-1');
});

test('updateFoodDay sends the caller operation ID for completion changes', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    await client.updateFoodDay(
        { date: '2026-07-11', is_complete: true },
        'food-day-operation-1'
    );

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/food-days');
    assert.equal(getOperationId(requests[0]), 'food-day-operation-1');
});

test('operation ID header is omitted when callers do not provide one', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    await client.addMetric({ weight: 82.5, date: '2026-07-11' });

    assert.equal(getOperationId(requests[0]), null);
});
