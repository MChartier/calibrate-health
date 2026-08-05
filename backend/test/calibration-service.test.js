const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

const { CALIBRATION_MODEL_VERSION } = require('../../shared/calibration');
const { getCalibrationScenario } = require('../../shared/calibrationScenarios');

function stubModule(path, exports) {
  const stub = new Module(path);
  stub.exports = exports;
  stub.loaded = true;
  require.cache[path] = stub;
}

function loadCalibrationService({ prisma, currentPlan = null, operations = {} }) {
  const paths = {
    database: require.resolve('../src/config/database'),
    trend: require.resolve('../src/services/materializedWeightTrend'),
    caloriePlan: require.resolve('../src/services/caloriePlan'),
    profile: require.resolve('../src/utils/profile'),
    operations: require.resolve('../src/services/clientOperations'),
    service: require.resolve('../src/services/calibration')
  };
  const previous = new Map(Object.values(paths).map((path) => [path, require.cache[path]]));
  delete require.cache[paths.service];
  stubModule(paths.database, prisma);
  stubModule(paths.trend, { ensureMaterializedWeightTrends: async () => undefined });
  stubModule(paths.caloriePlan, { getEffectiveCaloriePlan: async () => currentPlan });
  stubModule(paths.profile, {
    calculateAge: () => 38,
    buildCalorieSummary: () => ({ bmr: 1650, tdee: 2400, missing: [] })
  });
  stubModule(paths.operations, {
    ClientOperationConflictError: class ClientOperationConflictError extends Error {},
    executeIdempotentMutation: operations.executeIdempotentMutation ?? (async () => {
      throw new Error('Unexpected idempotent mutation');
    }),
    recordSyncChange: operations.recordSyncChange ?? (async () => undefined)
  });
  const loaded = require('../src/services/calibration');
  for (const [path, cached] of previous) {
    if (cached) require.cache[path] = cached;
    else delete require.cache[path];
  }
  return loaded;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function createHarness({ scenarioId = 'target-too-high', scheduledRevision = null, currentPlan = null, pausedDates = [] } = {}) {
  const scenario = getCalibrationScenario(scenarioId);
  assert.ok(scenario);
  const captured = {
    upserts: [],
    staleUpdates: [],
    operation: null,
    revision: null,
    deletedRevisionId: null,
    appliedAt: null,
    sync: null
  };
  let storedRecommendation = null;
  const pausedDateSet = new Set(pausedDates);
  const logs = scenario.input.foodDays.flatMap((day) => [
    { local_date: new Date(`${day.date}T00:00:00.000Z`), calories: Math.floor(day.calories / 2), meal_period: 'BREAKFAST' },
    { local_date: new Date(`${day.date}T00:00:00.000Z`), calories: Math.ceil(day.calories / 2), meal_period: 'DINNER' }
  ]);
  const completionDays = scenario.input.foodDays.map((day) => ({
    local_date: new Date(`${day.date}T00:00:00.000Z`),
    status: pausedDateSet.has(day.date) ? 'PAUSED' : (day.isComplete ? 'COMPLETE' : 'INCOMPLETE')
  }));
  const weightRows = scenario.input.weightPoints.map((point, index) => ({
    id: index + 1,
    date: new Date(`${point.date}T00:00:00.000Z`),
    weight_grams: Math.round(point.trendWeightKg * 1000),
    trend: {
      trend_weight_grams: Math.round(point.trendWeightKg * 1000),
      trend_ci_lower_grams: Math.round(point.lowerKg * 1000),
      trend_ci_upper_grams: Math.round(point.upperKg * 1000)
    }
  }));
  const serviceInput = {
    asOfDate: scenario.input.asOfDate,
    weightUnit: scenario.input.weightUnit,
    ageYears: 38,
    bmrKcal: 1650,
    profileTdeeKcal: 2400,
    configuredDailyDeficitKcal: scenario.input.configuredDailyDeficitKcal,
    currentTargetAdjustmentKcal: currentPlan?.targetAdjustmentKcal ?? 0,
    foodDays: scenario.input.foodDays.map((day) => ({
      date: day.date,
      calories: day.calories,
      entryCount: 2,
      mealPeriodCount: 2,
      isComplete: pausedDateSet.has(day.date) ? false : day.isComplete,
      isPaused: pausedDateSet.has(day.date)
    })),
    trackingPaused: false,
    weightPoints: weightRows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      trendWeightKg: row.trend.trend_weight_grams / 1000,
      lowerKg: row.trend.trend_ci_lower_grams / 1000,
      upperKg: row.trend.trend_ci_upper_grams / 1000
    }))
  };
  const prisma = {
    user: { findUnique: async () => ({
      id: 7,
      timezone: 'UTC',
      weight_unit: scenario.input.weightUnit,
      date_of_birth: new Date('1988-01-01T00:00:00.000Z'),
      sex: 'MALE',
      height_mm: 1800,
      activity_level: 'MODERATE'
    }) },
    goal: { findFirst: async () => ({
      id: 41,
      user_id: 7,
      daily_deficit: scenario.input.configuredDailyDeficitKcal,
      created_at: new Date('2026-06-01T00:00:00.000Z')
    }) },
    foodLogDay: {
      findUnique: async () => null,
      findMany: async () => completionDays
    },
    foodLog: { findMany: async () => logs },
    bodyMetric: {
      findFirst: async () => ({ weight_grams: 82000 }),
      findMany: async () => weightRows
    },
    activityDaySummary: { findMany: async () => [] },
    caloriePlanRevision: {
      findFirst: async () => scheduledRevision,
      create: async ({ data }) => {
        const revision = { id: 12, ...data };
        captured.revision = revision;
        if (storedRecommendation) storedRecommendation.plan_revision = revision;
        return revision;
      },
      delete: async ({ where }) => {
        captured.deletedRevisionId = where.id;
        const deleted = storedRecommendation?.plan_revision;
        if (storedRecommendation) storedRecommendation.plan_revision = null;
        return deleted;
      }
    },
    calibrationRecommendation: {
      updateMany: async (args) => {
        captured.staleUpdates.push(args);
        return { count: 0 };
      },
      upsert: async (args) => {
        captured.upserts.push(args);
        storedRecommendation ??= { id: 9, status: 'PENDING', plan_revision: null, ...args.create };
        return storedRecommendation;
      },
      findFirst: async () => storedRecommendation,
      update: async ({ data }) => {
        captured.appliedAt = data.applied_at;
        storedRecommendation = { ...storedRecommendation, ...data };
        return storedRecommendation;
      }
    },
    $transaction: async (callback) => callback(prisma)
  };
  const operations = {
    executeIdempotentMutation: async (options) => {
      captured.operation = options;
      return options.mutate(prisma, options.operationId);
    },
    recordSyncChange: async (options) => { captured.sync = options; }
  };
  const service = loadCalibrationService({ prisma, currentPlan, operations });
  return { scenario, serviceInput, captured, prisma, service, getStoredRecommendation: () => storedRecommendation };
}

test('calibration status materializes a deterministic model-scoped recommendation', async () => {
  const harness = createHarness();
  const now = new Date('2026-08-01T12:00:00.000Z');
  const status = await harness.service.buildCalibrationStatus(7, now);

  assert.equal(status.evaluation.status, 'recommendation');
  assert.equal(status.recommendation.id, 9);
  assert.equal(status.recommendation.effectiveLocalDate, '2026-08-02');
  assert.equal(harness.captured.upserts.length, 1);
  const { weightUnit: _displayWeightUnit, ...actionEvidence } = harness.serviceInput;
  assert.equal(status.inputFingerprint, fingerprint({
    modelVersion: CALIBRATION_MODEL_VERSION,
    goalId: 41,
    planStartDate: '2026-06-01',
    actionEvidence
  }));
  assert.notEqual(status.inputFingerprint, fingerprint({
    goalId: 41,
    planStartDate: '2026-06-01',
    actionEvidence
  }));
  assert.notEqual(status.inputFingerprint, fingerprint({
    modelVersion: CALIBRATION_MODEL_VERSION,
    goalId: 41,
    planStartDate: '2026-06-01',
    input: harness.serviceInput
  }));
});

test('calibration status maps paused food days into a post-break evidence restart', async () => {
  const pausedDates = [
    '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
    '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28'
  ];
  const harness = createHarness({ pausedDates });
  const status = await harness.service.buildCalibrationStatus(7, new Date('2026-08-01T12:00:00.000Z'));

  assert.equal(status.evaluation.status, 'not_ready');
  assert.equal(status.evaluation.headline, 'Gathering new history after your break');
  assert.equal(status.evaluation.dataQuality.observationDays, 3);
  assert.equal(status.evaluation.dataQuality.confidentDays, 3);
  assert.equal(status.evaluation.dataQuality.incompleteDays, 0);
  assert.equal(status.evaluation.historyProgress.restartedAfterPause, true);
  assert.equal(status.recommendation, null);
});

test('scheduled revisions suppress new materialization and report the resulting budget', async () => {
  const harness = createHarness({
    scheduledRevision: {
      recommendation_id: 8,
      target_adjustment_kcal: 0,
      effective_local_date: new Date('2026-08-02T00:00:00.000Z')
    }
  });
  const status = await harness.service.buildCalibrationStatus(7, new Date('2026-08-01T12:00:00.000Z'));

  assert.equal(status.recommendation, null);
  assert.deepEqual(status.scheduledChange, {
    recommendationId: 8,
    targetAdjustmentKcal: 0,
    dailyCalorieBudgetKcal: 1900,
    effectiveLocalDate: '2026-08-02'
  });
  assert.equal(harness.captured.upserts.length, 0);
  assert.ok(harness.captured.staleUpdates.some((update) => update.where.status === 'PENDING'));
});

test('applying a recommendation revalidates, schedules one revision, and replays safely', async () => {
  const harness = createHarness();
  const now = new Date('2026-08-01T12:00:00.000Z');
  const status = await harness.service.buildCalibrationStatus(7, now);
  const result = await harness.service.applyCalibrationRecommendation({
    userId: 7,
    recommendationId: status.recommendation.id,
    operationId: 'calibration-op-0001',
    now
  });

  assert.deepEqual(result, {
    recommendationId: 9,
    targetAdjustmentKcal: -150,
    dailyCalorieBudgetKcal: 1750,
    effectiveLocalDate: '2026-08-02'
  });
  assert.deepEqual(harness.captured.operation.requestPayload, { recommendation_id: 9 });
  assert.equal(harness.captured.revision.source_goal_id, 41);
  assert.equal(harness.captured.revision.effective_local_date.toISOString().slice(0, 10), '2026-08-02');
  assert.equal(harness.captured.appliedAt, now);
  assert.equal(harness.captured.sync.payload.dailyCalorieBudgetKcal, 1750);

  const replay = await harness.service.applyCalibrationRecommendation({
    userId: 7,
    recommendationId: 9,
    operationId: 'calibration-op-0001',
    now
  });
  assert.deepEqual(replay, result);
});

test('canceling a future revision restores the recommendation for review', async () => {
  const harness = createHarness();
  const now = new Date('2026-08-01T12:00:00.000Z');
  const status = await harness.service.buildCalibrationStatus(7, now);
  await harness.service.applyCalibrationRecommendation({
    userId: 7,
    recommendationId: status.recommendation.id,
    operationId: 'calibration-op-apply',
    now
  });

  const restored = await harness.service.cancelScheduledCalibrationChange({
    userId: 7,
    recommendationId: status.recommendation.id,
    operationId: 'calibration-op-cancel',
    now
  });

  assert.equal(harness.captured.deletedRevisionId, 12);
  assert.equal(harness.getStoredRecommendation().status, 'PENDING');
  assert.equal(harness.getStoredRecommendation().applied_at, null);
  assert.equal(restored.scheduledChange, null);
  assert.equal(restored.recommendation.id, status.recommendation.id);
  assert.equal(harness.captured.operation.operationKind, 'calibration_recommendation.cancel');
  assert.equal(harness.captured.sync.action, 'delete');
});

test('a scheduled revision cannot be canceled after its effective local date', async () => {
  const harness = createHarness();
  const applyNow = new Date('2026-08-01T12:00:00.000Z');
  const status = await harness.service.buildCalibrationStatus(7, applyNow);
  await harness.service.applyCalibrationRecommendation({
    userId: 7,
    recommendationId: status.recommendation.id,
    operationId: 'calibration-op-apply',
    now: applyNow
  });

  await assert.rejects(
    harness.service.cancelScheduledCalibrationChange({
      userId: 7,
      recommendationId: status.recommendation.id,
      operationId: 'calibration-op-cancel-late',
      now: new Date('2026-08-02T12:00:00.000Z')
    }),
    /already started/
  );
  assert.equal(harness.captured.deletedRevisionId, null);
});
