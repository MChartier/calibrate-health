const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidIanaTimeZone,
  formatDateToLocalDateString,
  getUtcTodayDateOnly,
  getUtcTodayDateOnlyInTimeZone,
  normalizeToUtcDateOnly
} = require('../src/utils/date');

test('isValidIanaTimeZone validates common IANA time zones', () => {
  assert.equal(isValidIanaTimeZone('UTC'), true);
  assert.equal(isValidIanaTimeZone('America/Los_Angeles'), true);
  assert.equal(isValidIanaTimeZone('America/New_York'), true);

  assert.equal(isValidIanaTimeZone(''), false);
  assert.equal(isValidIanaTimeZone('   '), false);
  assert.equal(isValidIanaTimeZone('Not/AZone'), false);
  assert.equal(isValidIanaTimeZone(null), false);
});

test('formatDateToLocalDateString returns the calendar day for the supplied time zone', () => {
  const now = new Date('2025-01-01T05:00:00.000Z');

  // 05:00Z on Jan 1 is still Dec 31 in America/Los_Angeles (UTC-8 in winter).
  assert.equal(formatDateToLocalDateString(now, 'America/Los_Angeles'), '2024-12-31');

  // Same instant is Jan 1 in UTC.
  assert.equal(formatDateToLocalDateString(now, 'UTC'), '2025-01-01');
});

test('formatDateToLocalDateString throws for invalid IANA time zone identifiers', () => {
  const now = new Date('2025-01-01T05:00:00.000Z');
  assert.throws(() => formatDateToLocalDateString(now, 'Not/AZone'), RangeError);
});

test('getUtcTodayDateOnlyInTimeZone returns a UTC-normalized date-only value for the local day', () => {
  const now = new Date('2025-01-01T05:00:00.000Z');
  const laToday = getUtcTodayDateOnlyInTimeZone('America/Los_Angeles', now);
  assert.equal(laToday.toISOString(), '2024-12-31T00:00:00.000Z');

  const utcToday = getUtcTodayDateOnlyInTimeZone('UTC', now);
  assert.equal(utcToday.toISOString(), '2025-01-01T00:00:00.000Z');
});

test('normalizeToUtcDateOnly accepts Date and timestamp inputs', () => {
  assert.equal(normalizeToUtcDateOnly(new Date('2025-01-01T23:59:59.000Z')).toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(normalizeToUtcDateOnly(Date.parse('2025-01-02T05:00:00.000Z')).toISOString(), '2025-01-02T00:00:00.000Z');
});

test('normalizeToUtcDateOnly rejects invalid inputs', () => {
  assert.throws(() => normalizeToUtcDateOnly('not-a-date'), /Invalid date/);
  assert.throws(() => normalizeToUtcDateOnly({}), /Invalid date/);
});

test('getUtcTodayDateOnly returns a UTC-normalized date-only value', () => {
  const today = getUtcTodayDateOnly();
  assert.equal(today.getUTCHours(), 0);
  assert.equal(today.getUTCMinutes(), 0);
  assert.equal(today.getUTCSeconds(), 0);
  assert.equal(today.getUTCMilliseconds(), 0);
});
