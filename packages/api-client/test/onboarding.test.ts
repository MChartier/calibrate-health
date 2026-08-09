import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrateApiClient } from '../src/client.ts';

type CapturedRequest = { url: string; init: RequestInit };

const DRAFT = {
    schema_version: 1 as const,
    revision: 3,
    current_step: 'pace' as const,
    data: {
        weight_unit: 'KG' as const,
        height_unit: 'CM' as const,
        timezone: 'America/Los_Angeles',
        date_of_birth: '1990-04-12',
        sex: 'FEMALE' as const,
        height_mm: 1680,
        activity_level: 'MODERATE' as const,
        current_weight_grams: 79400,
        target_weight_grams: 76000,
        daily_deficit: 500
    },
    created_at: '2026-08-08T08:00:00.000Z',
    updated_at: '2026-08-09T08:00:00.000Z'
};

const USER = {
    id: 1,
    email: 'person@example.com',
    created_at: '2026-08-08T08:00:00.000Z',
    weight_unit: 'KG' as const,
    height_unit: 'CM' as const,
    timezone: 'America/Los_Angeles',
    language: 'en',
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true,
    date_of_birth: '1990-04-12',
    sex: 'FEMALE' as const,
    height_mm: 1680,
    activity_level: 'MODERATE' as const,
    profile_image_url: null,
    onboarding_completed_at: '2026-08-09T08:30:00.000Z'
};

const createClient = (requests: CapturedRequest[]): CalibrateApiClient =>
    new CalibrateApiClient({
        baseUrl: 'https://calibrate.example',
        getAccessToken: () => 'access-token',
        fetchImpl: (async (input, init) => {
            const request = { url: String(input), init: init ?? {} };
            requests.push(request);
            const { pathname } = new URL(request.url);

            if (request.init.method === 'DELETE') return new Response(null, { status: 204 });
            if (pathname.endsWith('/onboarding/complete')) {
                return Response.json({
                    receipt: {
                        operation_id: 'onboarding-operation-1',
                        completed_at: '2026-08-09T08:30:00.000Z',
                        goal_id: 41,
                        metric_id: 52,
                        sync_cursor: '73'
                    },
                    user: USER
                });
            }

            return Response.json(
                request.init.method === 'PUT'
                    ? { draft: DRAFT }
                    : { draft: DRAFT, recovered_from_legacy: false, onboarding_completed_at: null }
            );
        }) as typeof fetch
    });

const requestJson = (request: CapturedRequest): unknown => JSON.parse(String(request.init.body));

test('onboarding draft lifecycle uses the stable v1 route and optimistic revision', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    const loaded = await client.getOnboardingDraft();
    const saved = await client.saveOnboardingDraft({
        schema_version: 1,
        revision: loaded.draft?.revision,
        current_step: 'pace',
        data: DRAFT.data
    });
    await client.deleteOnboardingDraft();

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/onboarding/draft');
    assert.equal(requests[1]?.init.method, 'PUT');
    assert.equal(requests[2]?.init.method, 'DELETE');
    assert.equal(new Headers(requests[1]?.init.headers).get('authorization'), 'Bearer access-token');
    assert.deepEqual(requestJson(requests[1]!), {
        schema_version: 1,
        revision: 3,
        current_step: 'pace',
        data: DRAFT.data
    });
    assert.equal(saved.draft.revision, 3);
});

test('atomic completion sends the expected draft revision and stable operation ID', async () => {
    const requests: CapturedRequest[] = [];
    const client = createClient(requests);

    const result = await client.completeOnboarding(
        {
            schema_version: 1,
            expected_revision: 3,
            data: DRAFT.data
        },
        'onboarding-operation-1'
    );

    assert.equal(requests[0]?.url, 'https://calibrate.example/api/v1/onboarding/complete');
    assert.equal(requests[0]?.init.method, 'POST');
    assert.equal(
        new Headers(requests[0]?.init.headers).get('x-client-operation-id'),
        'onboarding-operation-1'
    );
    assert.deepEqual(requestJson(requests[0]!), {
        schema_version: 1,
        expected_revision: 3,
        data: DRAFT.data
    });
    assert.equal(result.receipt.operation_id, 'onboarding-operation-1');
    assert.equal(result.user.onboarding_completed_at, '2026-08-09T08:30:00.000Z');
});
