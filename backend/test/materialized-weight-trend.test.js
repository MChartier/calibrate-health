const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function stubModule(resolvedPath, exports) {
  const moduleInstance = new Module(resolvedPath);
  moduleInstance.exports = exports;
  moduleInstance.loaded = true;
  require.cache[resolvedPath] = moduleInstance;
}

function loadMaterializedWeightTrendService(prismaStub) {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/materializedWeightTrend');

  const previousDbModule = require.cache[dbPath];
  delete require.cache[servicePath];

  stubModule(dbPath, prismaStub);
  const loaded = require('../src/services/materializedWeightTrend');

  if (previousDbModule) {
    require.cache[dbPath] = previousDbModule;
  } else {
    delete require.cache[dbPath];
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

test('materializedWeightTrend: recomputeAndStoreUserWeightTrends only refreshes active-horizon rows', async () => {
  const userId = 31;
  const metrics = buildDailyMetricHistory({
    userId,
    count: 220,
    endDate: new Date('2026-02-16T00:00:00Z')
  });

  let deletedWhere = null;
  let insertedRows = null;
  let modelFindManyArgs = null;
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
    }
  };
  const service = loadMaterializedWeightTrendService(prismaStub);

  await service.recomputeAndStoreUserWeightTrends(userId);

  const { activeStartDate, modelStartDate } = service.getMaterializedTrendWindowFromLatestDate(metrics[metrics.length - 1].date);
  assert.equal(modelFindManyArgs.where.date.gte.getTime(), modelStartDate.getTime());
  assert.deepEqual(modelFindManyArgs.where.user_id, userId);
  assert.deepEqual(deletedWhere, {
    user_id: userId,
    date: { gte: activeStartDate }
  });
  assert.ok(Array.isArray(insertedRows));
  assert.equal(insertedRows.length, service.MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS);
  assert.ok(insertedRows.every((row) => row.date >= activeStartDate));
  assert.ok(
    insertedRows.every(
      (row) =>
        Number.isInteger(row.trend_weight_grams) &&
        Number.isInteger(row.trend_ci_lower_grams) &&
        Number.isInteger(row.trend_ci_upper_grams) &&
        Number.isInteger(row.trend_std_grams)
    )
  );
});

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort invalidates stale rows when recompute fails', async () => {
  let invalidationWhere = null;
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => ({ date: new Date('2026-02-16T00:00:00Z') }),
      findMany: async () => {
        throw new Error('recompute read failed');
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
});

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort warns when recompute and invalidation both fail', async () => {
  const prismaStub = {
    bodyMetric: {
      findFirst: async () => ({ date: new Date('2026-02-16T00:00:00Z') }),
      findMany: async () => {
        throw new Error('recompute read failed');
      }
    },
    bodyMetricTrend: {
      deleteMany: async () => {
        throw new Error('invalidation failed');
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
  assert.match(warnings[0], /Recompute detail: recompute read failed/);
  assert.match(warnings[0], /Invalidation detail: invalidation failed/);
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
