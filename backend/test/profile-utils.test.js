const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activityMultiplier,
  buildCalorieSummary,
  calculateAge,
  calculateBmr,
  gramsToKg,
  isActivityLevel,
  isSex
} = require('../src/utils/profile');

test('profile utils: isSex validates allowed enum values', () => {
  assert.equal(isSex('MALE'), true);
  assert.equal(isSex('FEMALE'), true);

  assert.equal(isSex('male'), false);
  assert.equal(isSex(''), false);
  assert.equal(isSex(null), false);
});

test('profile utils: isActivityLevel validates allowed enum values', () => {
  assert.equal(isActivityLevel('SEDENTARY'), true);
  assert.equal(isActivityLevel('LIGHT'), true);
  assert.equal(isActivityLevel('MODERATE'), true);
  assert.equal(isActivityLevel('ACTIVE'), true);
  assert.equal(isActivityLevel('VERY_ACTIVE'), true);

  assert.equal(isActivityLevel('moderate'), false);
  assert.equal(isActivityLevel(''), false);
  assert.equal(isActivityLevel(undefined), false);
});

test('profile utils: calculateAge uses calendar comparisons and supports injected now', () => {
  const dob = new Date(1990, 0, 15);

  assert.equal(calculateAge(dob, new Date(2025, 0, 15)), 35);
  assert.equal(calculateAge(dob, new Date(2025, 0, 14)), 34);
  assert.equal(calculateAge(dob, new Date(2025, 1, 1)), 35);
});

test('profile utils: calculateBmr matches Mifflin-St Jeor and rounds to 0.1', () => {
  // Example: 82 kg, 175 cm, age 35.
  assert.equal(calculateBmr('MALE', 82, 175, 35), 1743.8);
  assert.equal(calculateBmr('FEMALE', 82, 175, 35), 1577.8);
});

test('profile utils: activityMultiplier matches the configured mapping', () => {
  assert.equal(activityMultiplier('SEDENTARY'), 1.2);
  assert.equal(activityMultiplier('LIGHT'), 1.375);
  assert.equal(activityMultiplier('MODERATE'), 1.55);
  assert.equal(activityMultiplier('ACTIVE'), 1.725);
  assert.equal(activityMultiplier('VERY_ACTIVE'), 1.9);
});

test('profile utils: gramsToKg converts grams to kg and rounds to 0.01 kg', () => {
  assert.equal(gramsToKg(82000), 82);
  assert.equal(gramsToKg(82349), 82.35);
});

test('profile utils: buildCalorieSummary returns missing fields when profile is incomplete', () => {
  const summary = buildCalorieSummary({
    weight_grams: null,
    profile: {},
    daily_deficit: null,
    now: new Date(2025, 0, 15)
  });

  assert.deepEqual(summary, {
    missing: ['latest_weight', 'sex', 'date_of_birth', 'height_mm', 'activity_level']
  });
});

test('profile utils: buildCalorieSummary computes BMR/TDEE and daily target when possible', () => {
  const summary = buildCalorieSummary({
    weight_grams: 82000,
    profile: {
      sex: 'MALE',
      date_of_birth: new Date(1990, 0, 15),
      height_mm: 1750,
      activity_level: 'MODERATE'
    },
    daily_deficit: 500,
    now: new Date(2025, 0, 15)
  });

  assert.deepEqual(summary, {
    bmr: 1743.8,
    tdee: 2702.9,
    dailyCalorieTarget: 2202.9,
    missing: [],
    sourceWeightKg: 82,
    deficit: 500
  });
});

test('profile utils: buildCalorieSummary omits daily target when deficit is unset', () => {
  const summary = buildCalorieSummary({
    weight_grams: 82000,
    profile: {
      sex: 'MALE',
      date_of_birth: new Date(1990, 0, 15),
      height_mm: 1750,
      activity_level: 'MODERATE'
    },
    now: new Date(2025, 0, 15)
  });

  assert.deepEqual(summary, {
    bmr: 1743.8,
    tdee: 2702.9,
    missing: [],
    sourceWeightKg: 82,
    deficit: null
  });
});

test('profile utils: buildCalorieSummary clamps negative calorie targets to 0', () => {
  const summary = buildCalorieSummary({
    weight_grams: 82000,
    profile: {
      sex: 'MALE',
      date_of_birth: new Date(1990, 0, 15),
      height_mm: 1750,
      activity_level: 'MODERATE'
    },
    daily_deficit: 99999,
    now: new Date(2025, 0, 15)
  });

  assert.equal(summary.dailyCalorieTarget, 0);
});

test('profile utils: buildCalorieSummary supports defaulting to the current date', () => {
  const summary = buildCalorieSummary({
    weight_grams: 82000,
    profile: {
      sex: 'MALE',
      date_of_birth: new Date(1990, 0, 15),
      height_mm: 1750,
      activity_level: 'MODERATE'
    },
    daily_deficit: 500
  });

  assert.equal(Array.isArray(summary.missing), true);
  assert.equal(summary.missing.length, 0);
  assert.equal(Number.isFinite(summary.bmr), true);
  assert.equal(Number.isFinite(summary.tdee), true);
  assert.equal(Number.isFinite(summary.dailyCalorieTarget), true);
});
