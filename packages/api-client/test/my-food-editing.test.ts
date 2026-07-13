import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient } from '../src/client.ts';

test('updateMyFood patches the owned resource with a typed snapshot definition', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: (async (input, init) => {
            request = { url: String(input), init: init ?? {} };
            return new Response(JSON.stringify({ id: 5 }), { status: 200 });
        }) as typeof fetch
    });
    const payload = {
        name: 'Oats',
        serving_size_quantity: 1,
        serving_unit_label: 'bowl',
        calories_per_serving: 180
    };
    await client.updateMyFood(5, payload);
    assert.equal(request?.url, 'https://calibrate.example/api/v1/my-foods/5');
    assert.equal(request?.init.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(request?.init.body)), payload);
});

test('deleteMyFood deletes the resource and accepts an empty response', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const client = new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        fetchImpl: (async (input, init) => {
            request = { url: String(input), init: init ?? {} };
            return new Response(null, { status: 204 });
        }) as typeof fetch
    });
    await client.deleteMyFood(5);
    assert.equal(request?.url, 'https://calibrate.example/api/v1/my-foods/5');
    assert.equal(request?.init.method, 'DELETE');
});
