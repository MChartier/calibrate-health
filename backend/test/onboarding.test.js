const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const databasePath = require.resolve('../src/config/database');
const onboardingPath = require.resolve('../src/services/onboarding');
const previousDatabaseModule = require.cache[databasePath];
const databaseStub = {};
const databaseModule = new Module(databasePath);
databaseModule.exports = { __esModule: true, default: databaseStub };
databaseModule.loaded = true;
require.cache[databasePath] = databaseModule;
delete require.cache[onboardingPath];
const {
  completeOnboardingInTransaction,
  getOnboardingDraftState,
  parseCompleteOnboardingBody,
  parseDraftPutBody,
  upgradeOnboardingDraftData
} = require('../src/services/onboarding');
if (previousDatabaseModule) require.cache[databasePath] = previousDatabaseModule;
else delete require.cache[databasePath];

const NOW = new Date('2026-03-08T07:30:00.000Z');
const COMPLETE_DATA = {
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'America/Los_Angeles',
  date_of_birth: '1990-06-15',
  sex: 'FEMALE',
  height_mm: 1680,
  activity_level: 'MODERATE',
  current_weight_grams: 82000,
  target_weight_grams: 70000,
  daily_deficit: 500
};

function draftRow(revision = 1) {
  return {
    user_id: 7,
    schema_version: 1,
    revision,
    current_step: 'review',
    data: COMPLETE_DATA,
    created_at: new Date('2026-03-01T12:00:00.000Z'),
    updated_at: new Date('2026-03-02T12:00:00.000Z')
  };
}

function initialState({ revision = 1, goal = null } = {}) {
  return {
    user: {
      id: 7,
      email: 'person@example.com',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      onboarding_completed_at: null,
      weight_unit: 'KG',
      height_unit: 'CM',
      timezone: 'UTC',
      language: 'en',
      reminder_log_weight_enabled: true,
      reminder_log_food_enabled: true,
      haptics_enabled: true,
      date_of_birth: null,
      sex: null,
      height_mm: null,
      activity_level: null,
      profile_image: null,
      profile_image_mime_type: null
    },
    draft: draftRow(revision),
    metric: null,
    goal,
    syncMarker: null,
    existingResponse: null
  };
}

function createTransactionStub(state, counters) {
  return {
    $queryRawUnsafe: async () => [{ id: state.user.id }],
    user: {
      findUnique: async () => ({
        onboarding_completed_at: state.user.onboarding_completed_at,
        onboarding_draft: state.draft
      }),
      update: async ({ data }) => {
        Object.assign(state.user, data);
        counters.userWrites += 1;
        return { ...state.user };
      }
    },
    onboardingDraft: {
      update: async ({ data }) => {
        state.draft = {
          ...state.draft,
          ...data,
          revision: data.revision?.increment
            ? state.draft.revision + data.revision.increment
            : state.draft.revision
        };
        return state.draft;
      },
      deleteMany: async () => {
        counters.draftDeletes += 1;
        state.draft = null;
        return { count: 1 };
      }
    },
    bodyMetric: {
      upsert: async ({ where, update, create }) => {
        counters.metricUpserts += 1;
        state.metric = {
          id: state.metric?.id ?? 31,
          user_id: create.user_id,
          date: where.user_id_date.date,
          weight_grams: update.weight_grams
        };
        return state.metric;
      }
    },
    goal: {
      findFirst: async () => state.goal ? { id: state.goal.id } : null,
      update: async ({ data }) => {
        counters.goalUpdates += 1;
        state.goal = { ...state.goal, ...data };
        return state.goal;
      },
      create: async ({ data }) => {
        counters.goalCreates += 1;
        state.goal = { id: 41, created_at: NOW, ...data };
        return state.goal;
      }
    },
    syncChange: {
      create: async ({ data }) => {
        counters.syncWrites += 1;
        state.syncMarker = { id: 51n, ...data };
        return state.syncMarker;
      }
    },
    clientOperation: {
      findFirst: async () =>
        state.existingResponse ? { response_body: state.existingResponse } : null
    }
  };
}

function counters() {
  return {
    userWrites: 0,
    metricUpserts: 0,
    goalCreates: 0,
    goalUpdates: 0,
    syncWrites: 0,
    draftDeletes: 0
  };
}

async function runTransaction(state, operationId, input, options = {}) {
  const working = structuredClone(state);
  const writeCounters = counters();
  const tx = createTransactionStub(working, writeCounters);
  const result = await completeOnboardingInTransaction(
    tx,
    7,
    operationId,
    input,
    options
  );
  Object.assign(state, working);
  return { result, writeCounters };
}

test('onboarding parsers enforce V1, completion requirements, and optimistic revisions', () => {
  assert.deepEqual(parseDraftPutBody({
    schema_version: 1,
    revision: 3,
    current_step: 'about',
    data: { weight_unit: 'KG', current_weight_grams: 82000 }
  }), {
    ok: true,
    value: {
      revision: 3,
      currentStep: 'about',
      data: { weight_unit: 'KG', current_weight_grams: 82000 }
    }
  });

  const unsupported = parseDraftPutBody({
    schema_version: 2,
    current_step: 'goal',
    data: {}
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, 'ONBOARDING_DRAFT_VERSION_UNSUPPORTED');

  const missing = parseCompleteOnboardingBody({ schema_version: 1, data: {} });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'INVALID_ONBOARDING_DRAFT');
  assert.deepEqual(missing.fieldErrors, {
    weight_unit: ['This field is required.']
  });

  const complete = parseCompleteOnboardingBody({
    schema_version: 1,
    expected_revision: 4,
    data: COMPLETE_DATA
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.value.expectedRevision, 4);

  const minor = parseCompleteOnboardingBody({
    schema_version: 1,
    expected_revision: 4,
    data: { ...COMPLETE_DATA, date_of_birth: '2020-06-15' }
  });
  assert.equal(minor.ok, false);
  assert.equal(minor.code, 'INVALID_ONBOARDING_DRAFT');
  assert.deepEqual(minor.fieldErrors, {
    date_of_birth: ['Calibrate accounts require age 18 or older.']
  });
});

test('onboarding draft upgrade converts version 0 measurement names to canonical V1', () => {
  assert.deepEqual(upgradeOnboardingDraftData(0, {
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    heightMm: 1700,
    currentWeightGrams: 80000,
    targetWeightGrams: 75000
  }), {
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'UTC',
    height_mm: 1700,
    current_weight_grams: 80000,
    target_weight_grams: 75000
  });
});

test('legacy partial setup is recovered once and resumes as the same cross-device draft', async () => {
  let storedDraft = null;
  let createCalls = 0;
  const legacyUser = {
    onboarding_completed_at: null,
    weight_unit: 'LB',
    height_unit: 'FT_IN',
    timezone: 'America/New_York',
    date_of_birth: new Date('1985-04-10T00:00:00.000Z'),
    sex: 'MALE',
    height_mm: null,
    activity_level: null,
    metrics: [{ weight_grams: 91000 }],
    goals: [],
    get onboarding_draft() {
      return storedDraft;
    }
  };
  const tx = {
    $queryRawUnsafe: async () => [{ id: 7 }],
    user: {
      findUnique: async () => legacyUser
    },
    onboardingDraft: {
      create: async ({ data }) => {
        createCalls += 1;
        storedDraft = {
          user_id: data.user_id,
          schema_version: data.schema_version,
          revision: 1,
          current_step: data.current_step,
          data: data.data,
          created_at: new Date('2026-03-01T12:00:00.000Z'),
          updated_at: new Date('2026-03-01T12:00:00.000Z')
        };
        return storedDraft;
      },
      update: async () => {
        throw new Error('Unexpected draft upgrade');
      }
    }
  };
  databaseStub.$transaction = async (callback) => callback(tx);

  const recovered = await getOnboardingDraftState(7);
  const resumed = await getOnboardingDraftState(7);

  assert.equal(recovered.recovered_from_legacy, true);
  assert.equal(recovered.draft.current_step, 'goal');
  assert.deepEqual(recovered.draft.data, {
    weight_unit: 'LB',
    height_unit: 'FT_IN',
    timezone: 'America/New_York',
    date_of_birth: '1985-04-10',
    sex: 'MALE',
    current_weight_grams: 91000
  });
  assert.equal(resumed.recovered_from_legacy, false);
  assert.deepEqual(resumed.draft, recovered.draft);
  assert.equal(createCalls, 1);
});

test('atomic completion uses the submitted timezone day and updates a legacy goal without duplication', async () => {
  const state = initialState({
    goal: {
      id: 41,
      user_id: 7,
      created_at: new Date('2026-02-01T00:00:00.000Z'),
      start_weight_grams: 83000,
      target_weight_grams: 71000,
      daily_deficit: 250
    }
  });
  const { result, writeCounters } = await runTransaction(
    state,
    'onboard-operation-001',
    { expectedRevision: 1, data: COMPLETE_DATA },
    { now: NOW }
  );

  assert.equal(result.status, 200);
  assert.equal(state.metric.date.toISOString().slice(0, 10), '2026-03-07');
  assert.equal(writeCounters.goalCreates, 0);
  assert.equal(writeCounters.goalUpdates, 1);
  assert.equal(state.goal.id, 41);
  assert.equal(state.goal.daily_deficit, 500);
  assert.equal(state.user.onboarding_completed_at.toISOString(), NOW.toISOString());
  assert.equal(state.draft, null);
  assert.deepEqual(result.body.receipt, {
    operation_id: 'onboard-operation-001',
    completed_at: NOW.toISOString(),
    goal_id: 41,
    metric_id: 31,
    sync_cursor: '51'
  });
  assert.deepEqual(state.syncMarker.payload, {
    schema_version: 1,
    completed_at: NOW.toISOString()
  });
});

test('stale completion returns the current draft before any domain write', async () => {
  const state = initialState({ revision: 5 });
  const { result, writeCounters } = await runTransaction(
    state,
    'onboard-operation-stale',
    { expectedRevision: 4, data: COMPLETE_DATA },
    { now: NOW }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'ONBOARDING_DRAFT_CONFLICT');
  assert.equal(result.body.draft.revision, 5);
  assert.deepEqual(writeCounters, counters());
  assert.equal(state.user.onboarding_completed_at, null);
});

test('a later operation returns the first completion receipt without duplicate metric or goal writes', async () => {
  const state = initialState();
  const first = await runTransaction(
    state,
    'onboard-operation-first',
    { expectedRevision: 1, data: COMPLETE_DATA },
    { now: NOW }
  );
  state.existingResponse = first.result.body;

  const second = await runTransaction(
    state,
    'onboard-operation-second',
    { data: COMPLETE_DATA },
    { now: new Date('2026-03-08T08:00:00.000Z') }
  );

  assert.equal(second.result.status, 200);
  assert.deepEqual(second.result.body, first.result.body);
  assert.equal(second.writeCounters.metricUpserts, 0);
  assert.equal(second.writeCounters.goalCreates, 0);
  assert.equal(second.writeCounters.goalUpdates, 0);
  assert.equal(second.writeCounters.syncWrites, 0);
});

test('representative injected failures leave the committed state unchanged', async () => {
  for (const failureStage of ['profile', 'metric', 'goal', 'completion']) {
    const state = initialState();
    const before = structuredClone(state);
    const working = structuredClone(state);
    const tx = createTransactionStub(working, counters());

    await assert.rejects(
      () => completeOnboardingInTransaction(
        tx,
        7,
        'onboard-operation-rollback',
        { expectedRevision: 1, data: COMPLETE_DATA },
        {
          now: NOW,
          afterWrite: (stage) => {
            if (stage === failureStage) throw new Error('Injected transaction failure');
          }
        }
      ),
      /Injected transaction failure/
    );

    assert.deepEqual(state, before, failureStage);
  }
});

test('atomic onboarding migration backfills only complete legacy accounts', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../prisma/migrations/0036_atomic_onboarding/migration.sql'),
    'utf8'
  );
  assert.match(migration, /ADD COLUMN "onboarding_completed_at"/);
  assert.match(migration, /CREATE TABLE "OnboardingDraft"/);
  assert.match(migration, /"date_of_birth" IS NOT NULL/);
  assert.equal(migration.includes('EXISTS (SELECT 1 FROM "BodyMetric"'), true);
  assert.equal(migration.includes('EXISTS (SELECT 1 FROM "Goal"'), true);
});
