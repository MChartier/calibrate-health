const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ABSOLUTE_MIN_TARGET_KCAL,
  SIGNED_DAILY_DEFICIT_OPTIONS,
  calculatePolicyBmr,
  evaluateAdultEligibility,
  evaluateCaloriePlan,
  projectGoalEndDate
} = require('../../shared/caloriePolicy');

const noonUtc = (date) => new Date(`${date}T12:00:00.000Z`);

test('calorie policy uses exact date-only adult boundaries and rejects invalid inputs', () => {
  assert.deepEqual(evaluateAdultEligibility({ dateOfBirth: '2008-08-08', timezone: 'UTC', now: noonUtc('2026-08-08') }), {
    status: 'eligible', reasonCode: null, ageYears: 18, localDate: '2026-08-08'
  });
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '2008-08-09', timezone: 'UTC', now: noonUtc('2026-08-08') }).reasonCode, 'AGE_UNDER_18');
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '1905-08-09', timezone: 'UTC', now: noonUtc('2026-08-08') }).ageYears, 120);
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '1905-08-08', timezone: 'UTC', now: noonUtc('2026-08-08') }).reasonCode, 'AGE_OVER_120');
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '2026-08-09', timezone: 'UTC', now: noonUtc('2026-08-08') }).reasonCode, 'DATE_OF_BIRTH_IN_FUTURE');
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '2024-02-30', timezone: 'UTC', now: noonUtc('2026-08-08') }).reasonCode, 'DATE_OF_BIRTH_INVALID');
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '1990-01-01', timezone: 'Not/A_Zone', now: noonUtc('2026-08-08') }).reasonCode, 'TIMEZONE_INVALID');
});

test('calorie policy evaluates the birthday against the account-local calendar day', () => {
  const instant = new Date('2026-08-08T06:30:00.000Z');
  assert.equal(evaluateAdultEligibility({
    dateOfBirth: '2008-08-08', timezone: 'America/Los_Angeles', now: instant
  }).reasonCode, 'AGE_UNDER_18');
  assert.equal(evaluateAdultEligibility({
    dateOfBirth: '2008-08-08', timezone: 'Asia/Tokyo', now: instant
  }).status, 'eligible');
});
test('calorie policy advances Feb 29 birthdays on March 1 in non-leap years', () => {
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '2008-02-29', timezone: 'UTC', now: noonUtc('2026-02-28') }).ageYears, 17);
  assert.equal(evaluateAdultEligibility({ dateOfBirth: '2008-02-29', timezone: 'UTC', now: noonUtc('2026-03-01') }).ageYears, 18);
});

test('calorie policy uses actual eligible ages and emits all signed options without clamping', () => {
  assert.equal(calculatePolicyBmr('FEMALE', 25_000, 1_000, 120), 114);
  const evaluation = evaluateCaloriePlan({
    profile: { timezone: 'UTC', dateOfBirth: '1906-08-08', sex: 'FEMALE', heightMm: 1_000, activityLevel: 'SEDENTARY' },
    latestWeightGrams: 25_000,
    now: noonUtc('2026-08-08')
  });
  assert.equal(evaluation.minimumDailyCalorieTarget, ABSOLUTE_MIN_TARGET_KCAL);
  assert.deepEqual(evaluation.planOptions.map((option) => option.dailyDeficit), [...SIGNED_DAILY_DEFICIT_OPTIONS]);
  assert.equal(evaluation.planOptions.length, 9);
  assert.deepEqual(evaluation.planOptions.find((option) => option.dailyDeficit === 1_000), {
    dailyDeficit: 1_000, available: false, dailyCalorieTarget: null, reasonCode: 'TARGET_BELOW_MINIMUM'
  });
});

test('calorie policy requires both baseline and adjusted targets to remain above the BMR floor', () => {
  const common = {
    profile: { timezone: 'UTC', dateOfBirth: '1996-08-08', sex: 'FEMALE', heightMm: 1_650, activityLevel: 'SEDENTARY' },
    latestWeightGrams: 70_000,
    goal: { startWeightGrams: 70_000, targetWeightGrams: 60_000, dailyDeficit: 250, reviewStatus: 'CLEAR' },
    now: noonUtc('2026-08-08')
  };
  assert.equal(evaluateCaloriePlan(common).status, 'available');
  const unsafe = evaluateCaloriePlan({ ...common, targetAdjustmentKcal: -250 });
  assert.equal(unsafe.status, 'requires_review');
  assert.equal(unsafe.reasonCode, 'PLAN_REVISION_UNSAFE');
  assert.equal(unsafe.dailyCalorieTarget, null);
});

test('projection gives maintenance precedence and applies account-unit energy constants exactly', () => {
  const base = {
    planStatus: 'available', planReasonCode: null, localDate: '2026-01-01',
    currentWeightGrams: 200_000, targetWeightGrams: 100_000
  };
  assert.deepEqual(projectGoalEndDate({ ...base, dailyDeficit: 0, weightUnit: 'KG' }), {
    status: 'maintenance', projectedEndDate: null, reasonCode: null
  });
  assert.equal(projectGoalEndDate({ ...base, dailyDeficit: 1_000, weightUnit: 'KG' }).projectedEndDate, '2028-02-10');
  assert.equal(projectGoalEndDate({ ...base, dailyDeficit: 1_000, weightUnit: 'LB' }).projectedEndDate, '2028-02-12');
});
