const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addUtcDays,
  buildMealLogsForDay,
  getMealTemplatesForSeedDayIndex,
  getPastWeekDates,
  getSeedUserCreatedAt
} = require('../src/services/devTestDataUtils');

test('devTestDataUtils: addUtcDays adds days using UTC math without mutating the input', () => {
  const input = new Date('2025-01-15T12:34:56Z');
  const result = addUtcDays(input, 2);

  assert.equal(input.toISOString(), '2025-01-15T12:34:56.000Z');
  assert.equal(result.toISOString(), '2025-01-17T12:34:56.000Z');
});

test('devTestDataUtils: getPastWeekDates returns 7 UTC date-only values ending on the local day', () => {
  // 05:00Z is prior local day in America/Los_Angeles (UTC-8 in winter).
  const now = new Date('2025-01-02T05:00:00Z');
  const dates = getPastWeekDates('America/Los_Angeles', now);

  assert.equal(dates.length, 7);

  // Local day is 2025-01-01, so the seed week ends at that local day.
  assert.equal(dates[6].toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(dates[0].toISOString(), '2024-12-26T00:00:00.000Z');

  for (const date of dates) {
    assert.equal(date.getUTCHours(), 0);
    assert.equal(date.getUTCMinutes(), 0);
    assert.equal(date.getUTCSeconds(), 0);
    assert.equal(date.getUTCMilliseconds(), 0);
  }
});

test('devTestDataUtils: getSeedUserCreatedAt picks a UTC hour that preserves the earliest seed local day', () => {
  const seedDays = [new Date('2025-01-01T00:00:00Z')];

  const laCreatedAt = getSeedUserCreatedAt(seedDays, 'America/Los_Angeles');
  assert.equal(laCreatedAt.toISOString(), '2025-01-01T12:00:00.000Z');

  // Pacific/Kiritimati is UTC+14; noon UTC would land on the next local day, so we use 00:00 UTC.
  const kiritimatiCreatedAt = getSeedUserCreatedAt(seedDays, 'Pacific/Kiritimati');
  assert.equal(kiritimatiCreatedAt.toISOString(), '2025-01-01T00:00:00.000Z');
});

test('devTestDataUtils: getSeedUserCreatedAt falls back when the timezone is invalid', () => {
  const seedDays = [new Date('2025-01-01T00:00:00Z')];
  const createdAt = getSeedUserCreatedAt(seedDays, 'Not/AZone');
  assert.equal(createdAt.toISOString(), '2025-01-01T12:00:00.000Z');
});

test('devTestDataUtils: getMealTemplatesForSeedDayIndex returns deterministic week plans', () => {
  const day0 = getMealTemplatesForSeedDayIndex(0);
  assert.ok(day0.length > 0);
  assert.equal(day0[0].name, 'Spinach omelet');

  const day7 = getMealTemplatesForSeedDayIndex(7);
  assert.deepEqual(
    day7.map((item) => item.name),
    day0.map((item) => item.name)
  );

  assert.deepEqual(getMealTemplatesForSeedDayIndex(-1), []);
});

test('devTestDataUtils: buildMealLogsForDay stamps log timestamps using the template time-of-day', () => {
  const userId = 123;
  const day = new Date('2025-01-01T00:00:00Z');

  const logs = buildMealLogsForDay(userId, day, 0);
  assert.ok(logs.length > 0);

  assert.equal(logs[0].user_id, userId);
  assert.equal(logs[0].local_date.toISOString(), day.toISOString());
  assert.equal(logs[0].name, 'Spinach omelet');
  assert.equal(logs[0].date.toISOString(), '2025-01-01T07:00:00.000Z');
});

