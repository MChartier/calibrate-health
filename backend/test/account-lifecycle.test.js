const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadAccountLifecycle(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/accountLifecycle');
  const previousDbModule = require.cache[dbPath];
  delete require.cache[servicePath];
  stubModule(dbPath, prismaStub);
  const loaded = require('../src/services/accountLifecycle');
  if (previousDbModule) require.cache[dbPath] = previousDbModule;
  else delete require.cache[dbPath];
  return loaded;
}

const at = (value) => new Date(value);

const exportRow = {
  id: 7,
  email: 'owner@example.com',
  created_at: at('2025-01-01T12:00:00.000Z'),
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'America/Los_Angeles',
  language: 'en',
  reminder_log_weight_enabled: true,
  reminder_log_food_enabled: false,
  haptics_enabled: true,
  date_of_birth: at('1990-05-03T00:00:00.000Z'),
  sex: 'MALE',
  height_mm: 1800,
  activity_level: 'MODERATE',
  profile_image: new Uint8Array([1, 2, 3]),
  profile_image_mime_type: 'image/png',
  goals: [{
    id: 2,
    user_id: 7,
    start_weight_grams: 90000,
    target_weight_grams: 80000,
    target_date: null,
    daily_deficit: 500,
    created_at: at('2025-01-02T00:00:00.000Z')
  }],
  metrics: [{
    id: 3,
    user_id: 7,
    date: at('2025-01-03T00:00:00.000Z'),
    weight_grams: 89500,
    body_fat_percent: 20.5
  }],
  food_logs: [{
    id: 4,
    user_id: 7,
    my_food_id: 5,
    date: at('2025-01-03T18:00:00.000Z'),
    local_date: at('2025-01-03T00:00:00.000Z'),
    meal_period: 'DINNER',
    name: 'Recipe snapshot',
    calories: 600,
    servings_consumed: 1.5,
    serving_size_quantity_snapshot: 1,
    serving_unit_label_snapshot: 'bowl',
    calories_per_serving_snapshot: 400,
    external_source: null,
    external_id: null,
    brand_snapshot: null,
    locale_snapshot: null,
    barcode_snapshot: null,
    measure_label_snapshot: null,
    grams_per_measure_snapshot: null,
    measure_quantity_snapshot: null,
    grams_total_snapshot: null,
    created_at: at('2025-01-03T18:00:00.000Z')
  }],
  food_log_days: [{
    id: 6,
    user_id: 7,
    local_date: at('2025-01-03T00:00:00.000Z'),
    status: 'COMPLETE',
    origin: 'IMPORT',
    completed_at: at('2025-01-04T01:00:00.000Z'),
    created_at: at('2025-01-03T00:00:00.000Z'),
    updated_at: at('2025-01-04T01:00:00.000Z')
  }],
  food_tracking_pauses: [{
    id: 12,
    user_id: 7,
    starts_on: at('2025-01-05T00:00:00.000Z'),
    expected_resume_on: at('2025-01-08T00:00:00.000Z'),
    resumed_on: at('2025-01-07T00:00:00.000Z'),
    started_at: at('2025-01-05T08:00:00.000Z'),
    resumed_at: at('2025-01-07T08:00:00.000Z'),
    materialized_through: at('2025-01-06T00:00:00.000Z'),
    created_at: at('2025-01-05T08:00:00.000Z'),
    updated_at: at('2025-01-07T08:00:00.000Z')
  }],
  my_foods: [{
    id: 5,
    user_id: 7,
    type: 'RECIPE',
    name: 'Dinner bowl',
    serving_size_quantity: 1,
    serving_unit_label: 'bowl',
    calories_per_serving: 400,
    is_pinned: true,
    recipe_total_calories: 800,
    yield_servings: 2,
    created_at: at('2025-01-02T00:00:00.000Z'),
    updated_at: at('2025-01-02T00:00:00.000Z'),
    recipe_ingredients: [{
      id: 8,
      recipe_id: 5,
      sort_order: 0,
      source: 'EXTERNAL',
      name_snapshot: 'Rice',
      calories_total_snapshot: 400,
      source_my_food_id: null,
      quantity_servings: null,
      serving_size_quantity_snapshot: null,
      serving_unit_label_snapshot: null,
      calories_per_serving_snapshot: null,
      external_source: 'usda',
      external_id: 'rice-1',
      brand_snapshot: null,
      locale_snapshot: 'en',
      barcode_snapshot: null,
      measure_label_snapshot: 'cup',
      grams_per_measure_snapshot: 180,
      measure_quantity_snapshot: 2,
      grams_total_snapshot: 360,
      created_at: at('2025-01-02T00:00:00.000Z')
    }]
  }],
  in_app_notifications: [{
    id: 9,
    user_id: 7,
    type: 'LOG_WEIGHT',
    local_date: at('2025-01-03T00:00:00.000Z'),
    title: 'Weigh in',
    body: 'Log today\'s weight.',
    action_url: '/weight',
    dedupe_key: 'private-internal-dedupe',
    read_at: null,
    dismissed_at: null,
    resolved_at: null,
    created_at: at('2025-01-03T08:00:00.000Z'),
    updated_at: at('2025-01-03T08:00:00.000Z')
  }],
  activity_records: [{
    id: 10,
    user_id: 7,
    source_device_id: 'private-device-id',
    record_type: 'STEPS',
    external_id: 'health-record-1',
    data_origin: 'com.sec.android.app.shealth',
    client_record_id: null,
    client_record_version: 2n,
    source_updated_at: at('2025-01-03T20:00:00.000Z'),
    start_time: at('2025-01-03T18:00:00.000Z'),
    end_time: at('2025-01-03T19:00:00.000Z'),
    start_zone_offset_seconds: -28800,
    end_zone_offset_seconds: -28800,
    local_date: at('2025-01-03T00:00:00.000Z'),
    step_count: 1500,
    energy_kcal: null,
    weight_grams: null,
    exercise_type: null,
    title: null,
    notes: null,
    recording_method: 2,
    device_type: 6,
    device_manufacturer: 'Samsung',
    device_model: 'Galaxy Watch Ultra',
    created_at: at('2025-01-03T20:00:00.000Z'),
    updated_at: at('2025-01-03T20:00:00.000Z')
  }],
  activity_day_summaries: [{
    id: 11,
    user_id: 7,
    source_device_id: 'private-device-id',
    local_date: at('2025-01-03T00:00:00.000Z'),
    steps: 9000,
    active_calories_kcal: 450,
    total_calories_kcal: 2400,
    exercise_minutes: 45,
    observed_at: at('2025-01-04T01:00:00.000Z'),
    created_at: at('2025-01-04T01:00:00.000Z'),
    updated_at: at('2025-01-04T01:00:00.000Z')
  }]
};

test('account export returns canonical versioned tracking data without credentials', async () => {
  let findArgs = null;
  const { exportAccountData } = loadAccountLifecycle({
    user: {
      findUnique: async (args) => {
        findArgs = args;
        return exportRow;
      }
    }
  });

  const result = await exportAccountData(7, at('2026-07-11T20:00:00.000Z'));

  assert.equal(result.format, 'calibrate-account-export');
  assert.equal(result.version, 3);
  assert.equal(result.exported_at, '2026-07-11T20:00:00.000Z');
  assert.equal(result.account.date_of_birth, '1990-05-03');
  assert.deepEqual(result.account.profile_image, { mime_type: 'image/png', data_base64: 'AQID' });
  assert.equal(result.body_metrics[0].date, '2025-01-03');
  assert.equal(result.food_logs[0].serving_unit_label_snapshot, 'bowl');
  assert.equal(result.food_log_days[0].status, 'COMPLETE');
  assert.equal(result.food_log_days[0].origin, 'IMPORT');
  assert.equal(result.food_tracking_pauses[0].resumed_on, '2025-01-07');
  assert.equal(result.my_foods[0].is_pinned, true);
  assert.equal(result.my_foods[0].recipe_ingredients[0].external_id, 'rice-1');
  assert.equal(result.activity_records[0].client_record_version, '2');
  assert.equal(result.activity_day_summaries[0].total_calories_kcal, 2400);

  assert.equal(findArgs.where.id, 7);
  assert.equal(findArgs.select.password_hash, undefined);
  assert.equal(findArgs.select.mobile_sessions, undefined);
  assert.equal(findArgs.select.push_subscriptions, undefined);
  assert.equal(findArgs.select.native_push_subscriptions, undefined);
  assert.equal(findArgs.select.client_operations, undefined);
  assert.equal(findArgs.select.sync_changes, undefined);
  assert.equal(findArgs.select.health_connect_sync_states, undefined);
  assert.equal(findArgs.select.health_connect_tombstones, undefined);
  assert.deepEqual(findArgs.select.goals.orderBy, [{ created_at: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(findArgs.select.food_logs.orderBy, [
    { local_date: 'asc' },
    { created_at: 'asc' },
    { id: 'asc' }
  ]);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /password_hash|access_token|refresh_token|p256dh|private-internal-dedupe|private-device-id/);
});

test('account export returns null for a missing account', async () => {
  const { exportAccountData } = loadAccountLifecycle({ user: { findUnique: async () => null } });
  assert.equal(await exportAccountData(404), null);
});

test('account deletion removes only the selected account root', async () => {
  let deleteArgs = null;
  const { deleteAccountData } = loadAccountLifecycle({
    user: {
      deleteMany: async (args) => {
        deleteArgs = args;
        return { count: 1 };
      }
    }
  });

  assert.equal(await deleteAccountData(7), true);
  assert.deepEqual(deleteArgs, { where: { id: 7 } });
});
