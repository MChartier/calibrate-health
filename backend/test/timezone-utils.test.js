const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidIanaTimeZone,
  formatDateToLocalDateString,
  getUtcTodayDateOnlyInTimeZone
} = require('../src/utils/date');

test('isValidIanaTimeZone validates common IANA time zones', () => {
  assert.equal(isValidIanaTimeZone('UTC'), true);
  assert.equal(isValidIanaTimeZone('America/Los_Angeles'), true);
  assert.equal(isValidIanaTimeZone('America/New_York'), true);

  assert.equal(isValidIanaTimeZone(''), false);
  assert.equal(isValidIanaTimeZone('   '), false);
  assert.equal(isValidIanaTimeZone('Not/AZone'), false);
});

test('formatDateToLocalDateString returns the calendar day for the supplied time zone', () => {
  const now = new Date('2025-01-01T05:00:00.000Z');

  // 05:00Z on Jan 1 is still Dec 31 in America/Los_Angeles (UTC-8 in winter).
  assert.equal(formatDateToLocalDateString(now, 'America/Los_Angeles'), '2024-12-31');

  // Same instant is Jan 1 in UTC.
  assert.equal(formatDateToLocalDateString(now, 'UTC'), '2025-01-01');
});

test('getUtcTodayDateOnlyInTimeZone returns a UTC-normalized date-only value for the local day', () => {
  const now = new Date('2025-01-01T05:00:00.000Z');
  const laToday = getUtcTodayDateOnlyInTimeZone('America/Los_Angeles', now);
  assert.equal(laToday.toISOString(), '2024-12-31T00:00:00.000Z');

  const utcToday = getUtcTodayDateOnlyInTimeZone('UTC', now);
  assert.equal(utcToday.toISOString(), '2025-01-01T00:00:00.000Z');
});
