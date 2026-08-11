const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadMaterializedWeightTrendService(prismaStub, model) {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/materializedWeightTrend');
  const weightTrendPath = require.resolve('../src/services/weightTrend');

  const previousDbModule = require.cache[dbPath];
  const previousWeightTrendModule = require.cache[weightTrendPath];
  const previousModel = process.env.WEIGHT_TREND_MODEL;
  delete require.cache[servicePath];
  delete require.cache[weightTrendPath];

  if (model === undefined) {
    delete process.env.WEIGHT_TREND_MODEL;
  } else {
    process.env.WEIGHT_TREND_MODEL = model;
  }

  const normalizedPrismaStub = {
    ...prismaStub,
    user: {
      findUnique: async () => ({ timezone: 'UTC' }),
      ...(prismaStub.user ?? {})
    }
  };
  normalizedPrismaStub.$transaction = prismaStub.$transaction
    ?? (async (callback) => callback(normalizedPrismaStub));

  stubModule(dbPath, normalizedPrismaStub);
  const loaded = require('../src/services/materializedWeightTrend');

  if (previousDbModule) {
    require.cache[dbPath] = previousDbModule;
  } else {
    delete require.cache[dbPath];
  }

  if (previousWeightTrendModule) {
    require.cache[weightTrendPath] = previousWeightTrendModule;
  } else {
    delete require.cache[weightTrendPath];
  }

  if (previousModel === undefined) {
    delete process.env.WEIGHT_TREND_MODEL;
  } else {
    process.env.WEIGHT_TREND_MODEL = previousModel;
  }

  return loaded;
}

/**
 * Build an ascending daily metric history ending on the supplied date.
 */
function buildDailyMetricHistory(opts) {
  const rows = [];
  for (let index = 0; index < opts.count; index += 1) {
    const offsetDays = opts.count - index - 1;
    const date = new Date(opts.endDate);
    date.setUTCDate(date.getUTCDate() - offsetDays);
    rows.push({
      id: index + 1,
      user_id: opts.userId,
      date,
      weight_grams: 80000 - index * 15
    });
  }
  return rows;
}

test('materializedWeightTrend: recompute atomically replaces all rows with the active horizon', async () => {
  const userId = 31;
  const metrics = buildDailyMetricHistory({
    userId,
    count: 220,
    endDate: new Date('2026-02-16T00:00:00Z')
  });

  let deletedWhere = null;
  let insertedRows = null;
  let modelFindManyArgs = null;
  let transactionCount = 0;
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => ({ date: metrics[metrics.length - 1].date }),
      findMany: async (args) => {
        modelFindManyArgs = args;
        return metrics.filter((metric) => metric.date >= args.where.date.gte);
      }
    },
    bodyMetricTrend: {
      deleteMany: async (args) => {
        deletedWhere = args.where;
        return { count: 42 };
      },
      createMany: async (args) => {
        insertedRows = args.data;
        return { count: args.data.length };
      }
    },
    $transaction: async (callback) => {
      transactionCount += 1;
      return callback(prismaStub);
    }
  };
  const service = loadMaterializedWeightTrendService(prismaStub);

  await service.recomputeAndStoreUserWeightTrends(userId);

  const { activeStartDate, modelStartDate } = service.getMaterializedTrendWindowFromLatestDate(metrics[metrics.length - 1].date);
  assert.equal(modelFindManyArgs.where.date.gte.getTime(), modelStartDate.getTime());
  assert.deepEqual(modelFindManyArgs.where.user_id, userId);
  assert.deepEqual(deletedWhere, { user_id: userId });
  assert.ok(Array.isArray(insertedRows));
  assert.equal(transactionCount, 1, 'delete/create replacement should run in one transaction');
  assert.equal(insertedRows.length, service.MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS);
  assert.ok(insertedRows.every((row) => row.date >= activeStartDate));
  assert.ok(
    insertedRows.every(
      (row) =>
        Number.isInteger(row.trend_weight_grams) &&
        Number.isInteger(row.trend_ci_lower_grams) &&
        Number.isInteger(row.trend_ci_upper_grams) &&
        Number.isInteger(row.trend_std_grams) &&
        (row.trend_rate_grams_per_day === null || Number.isFinite(row.trend_rate_grams_per_day)) &&
        (row.trend_rate_std_grams_per_day === null || Number.isFinite(row.trend_rate_std_grams_per_day)) &&
        row.model_version === service.WEIGHT_TREND_MODEL_VERSION
    )
  );
});

test('materializedWeightTrend: v1 rollout writes version 1 rows without canonical rate state', async () => {
  const userId = 32;
  const asOfDate = new Date('2026-02-16T00:00:00Z');
  const metrics = buildDailyMetricHistory({ userId, count: 10, endDate: asOfDate });
  let insertedRows = null;
  let staleQuery = null;
  const prismaStub = {
    bodyMetric: {
      findFirst: async (args) => {
        if (args.where.OR) {
          staleQuery = args.where;
          return { id: metrics[metrics.length - 1].id };
        }
        return { date: metrics[metrics.length - 1].date };
      },
      findMany: async () => metrics
    },
    bodyMetricTrend: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }) => {
        insertedRows = data;
        return { count: data.length };
      }
    },
    $transaction: async (callback) => callback(prismaStub)
  };
  const service = loadMaterializedWeightTrendService(prismaStub, 'v1');

  await service.ensureMaterializedWeightTrends(userId, asOfDate);

  assert.equal(service.WEIGHT_TREND_MODEL_VERSION, 1);
  assert.deepEqual(staleQuery.OR, [
    { trend: { is: null } },
    { trend: { is: { model_version: { not: 1 } } } }
  ]);
  assert.equal(insertedRows.length, metrics.length);
  assert.ok(insertedRows.every((row) => row.model_version === 1));
  assert.ok(insertedRows.every((row) => row.trend_rate_grams_per_day === null));
  assert.ok(insertedRows.every((row) => row.trend_rate_std_grams_per_day === null));
});

test('materializedWeightTrend: excludes future-dated metrics from the model and active-horizon anchor', async () => {
  const userId = 44;
  const asOfDate = new Date('2026-02-16T00:00:00Z');
  const eligibleMetrics = buildDailyMetricHistory({ userId, count: 20, endDate: asOfDate });
  const futureMetric = {
    id: 999,
    user_id: userId,
    date: new Date('2026-12-31T00:00:00Z'),
    weight_grams: 120000
  };
  const allMetrics = [...eligibleMetrics, futureMetric];
  let insertedRows = [];
  let latestFindArgs = null;
  let modelFindArgs = null;
  const prismaStub = {
    user: { findUnique: async () => ({ timezone: 'UTC' }) },
    bodyMetric: {
      findFirst: async (args) => {
        latestFindArgs = args;
        const eligible = allMetrics.filter((metric) => metric.date <= args.where.date.lte);
        return eligible.length > 0 ? { date: eligible[eligible.length - 1].date } : null;
      },
      findMany: async (args) => {
        modelFindArgs = args;
        return allMetrics.filter(
          (metric) => metric.date >= args.where.date.gte && metric.date <= args.where.date.lte
        );
      }
    },
    bodyMetricTrend: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }) => {
        insertedRows = data;
        return { count: data.length };
      }
    }
  };
  prismaStub.$transaction = async (callback) => callback(prismaStub);
  const service = loadMaterializedWeightTrendService(prismaStub);

  await service.recomputeAndStoreUserWeightTrends(userId, prismaStub, asOfDate);

  assert.equal(latestFindArgs.where.date.lte.getTime(), asOfDate.getTime());
  assert.equal(modelFindArgs.where.date.lte.getTime(), asOfDate.getTime());
  assert.ok(insertedRows.length > 0);
  assert.ok(insertedRows.every((row) => row.date <= asOfDate));
  assert.equal(insertedRows.some((row) => row.metric_id === futureMetric.id), false);
});

test('materializedWeightTrend: rounds v2 level fields while preserving floating-point rate state', async () => {
  const asOfDate = new Date('2026-02-16T00:00:00Z');
  const metric = {
    id: 7,
    user_id: 3,
    date: asOfDate,
    weight_grams: 80123
  };
  let insertedRows = [];
  const prismaStub = {
    user: { findUnique: async () => ({ timezone: 'UTC' }) },
    bodyMetric: {
      findFirst: async () => ({ date: metric.date }),
      findMany: async () => [metric]
    },
    bodyMetricTrend: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }) => {
        insertedRows = data;
        return { count: data.length };
      }
    }
  };
  prismaStub.$transaction = async (callback) => callback(prismaStub);
  const service = loadMaterializedWeightTrendService(prismaStub);

  await service.recomputeAndStoreUserWeightTrends(3, prismaStub, asOfDate);

  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].trend_weight_grams, 80123);
  assert.equal(insertedRows[0].trend_std_grams, 900);
  assert.equal(insertedRows[0].trend_ci_lower_grams, 78359);
  assert.equal(insertedRows[0].trend_ci_upper_grams, 81887);
  assert.equal(insertedRows[0].trend_rate_grams_per_day, 0);
  assert.equal(insertedRows[0].trend_rate_std_grams_per_day, 150);
  assert.equal(insertedRows[0].model_version, 2);
});

test('materializedWeightTrend: ensure refreshes active rows from an older model version', async () => {
  const asOfDate = new Date('2026-02-16T00:00:00Z');
  const metric = { id: 1, user_id: 8, date: asOfDate, weight_grams: 80000 };
  let staleQuery = null;
  let insertedRows = [];
  const prismaStub = {
    user: { findUnique: async () => ({ timezone: 'UTC' }) },
    bodyMetric: {
      findFirst: async (args) => {
        if (args.where.OR) {
          staleQuery = args.where;
          return { id: metric.id };
        }
        return { date: metric.date };
      },
      findMany: async () => [metric]
    },
    bodyMetricTrend: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async ({ data }) => {
        insertedRows = data;
        return { count: data.length };
      }
    }
  };
  prismaStub.$transaction = async (callback) => callback(prismaStub);
  const service = loadMaterializedWeightTrendService(prismaStub);

  await service.ensureMaterializedWeightTrends(8, asOfDate);

  assert.deepEqual(staleQuery.OR, [
    { trend: { is: null } },
    { trend: { is: { model_version: { not: service.WEIGHT_TREND_MODEL_VERSION } } } }
  ]);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].model_version, service.WEIGHT_TREND_MODEL_VERSION);
});

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort invalidates stale rows when recompute fails', async () => {
  let invalidationWhere = null;
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => ({ date: new Date('2026-02-16T00:00:00Z') }),
      findMany: async () => {
        throw new Error('recompute read failed for weight_grams=80123');
      }
    },
    bodyMetricTrend: {
      deleteMany: async (args) => {
        invalidationWhere = args.where;
        return { count: 12 };
      }
    }
  };
  const service = loadMaterializedWeightTrendService(prismaStub);

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => {
    warnings.push(String(message));
  };

  try {
    await service.refreshMaterializedWeightTrendsBestEffort(42);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(invalidationWhere, { user_id: 42 });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /existing trend rows were invalidated/);
  assert.doesNotMatch(warnings[0], /80123|weight_grams|recompute read failed/);
});

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort warns when recompute and invalidation both fail', async () => {
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => ({ date: new Date('2026-02-16T00:00:00Z') }),
      findMany: async () => {
        throw new Error('recompute read failed for weight_grams=80123');
      }
    },
    bodyMetricTrend: {
      deleteMany: async () => {
        throw new Error('invalidation failed for trend_weight_grams=79999');
      }
    }
  };
  const service = loadMaterializedWeightTrendService(prismaStub);

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => {
    warnings.push(String(message));
  };

  try {
    await service.refreshMaterializedWeightTrendsBestEffort(17);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /stale rows could not be invalidated/);
  assert.doesNotMatch(warnings[0], /80123|79999|weight_grams|trend_weight_grams/);
});

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort stays quiet when recompute succeeds', async () => {
  let deleteCount = 0;
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => null
    },
    bodyMetricTrend: {
      deleteMany: async () => {
        deleteCount += 1;
        return { count: 0 };
      }
    }
  };
  const service = loadMaterializedWeightTrendService(prismaStub);

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => {
    warnings.push(String(message));
  };

  try {
    await service.refreshMaterializedWeightTrendsBestEffort(9);
  } finally {
    console.warn = originalWarn;
  }

  // Successful recompute for an empty history still clears old rows once.
  assert.equal(deleteCount, 1);
  assert.deepEqual(warnings, []);
});
