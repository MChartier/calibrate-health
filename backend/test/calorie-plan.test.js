const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadService() {
  const dbPath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/caloriePlan');
  const previousDb = require.cache[dbPath];
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const moduleInstance = new Module(dbPath);
  moduleInstance.exports = { caloriePlanRevision: {} };
  moduleInstance.loaded = true;
  require.cache[dbPath] = moduleInstance;
  const loaded = require('../src/services/caloriePlan');
  if (previousDb) require.cache[dbPath] = previousDb;
  else delete require.cache[dbPath];
  if (previousService) require.cache[servicePath] = previousService;
  else delete require.cache[servicePath];
  return loaded;
}

test('calorie plan resolves only revisions effective on the requested local date', async () => {
  const { getEffectiveCaloriePlan } = loadService();
  let query = null;
  const localDate = new Date('2026-08-01T00:00:00.000Z');
  const database = {
    caloriePlanRevision: {
      findFirst: async (args) => {
        query = args;
        return { id: 3, target_adjustment_kcal: -125, effective_local_date: localDate };
      }
    }
  };
  const result = await getEffectiveCaloriePlan(7, 41, localDate, database);
  assert.deepEqual(query.where, { user_id: 7, source_goal_id: 41, effective_local_date: { lte: localDate } });
  assert.deepEqual(query.orderBy, [{ effective_local_date: 'desc' }, { id: 'desc' }]);
  assert.equal(result.targetAdjustmentKcal, -125);
});
