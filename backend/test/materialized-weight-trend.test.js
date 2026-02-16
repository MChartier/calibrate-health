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

test('materializedWeightTrend: refreshMaterializedWeightTrendsBestEffort invalidates stale rows when recompute fails', async () => {
  let invalidationWhere = null;
  const prismaStub = {
    bodyMetric: {
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
      findMany: async () => []
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
