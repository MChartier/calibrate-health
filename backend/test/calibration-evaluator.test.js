const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateCalibration } = require('../../shared/calibration');
const { getCalibrationScenario } = require('../../shared/calibrationScenarios');

function evaluateScenario(id) {
  const scenario = getCalibrationScenario(id);
  assert.ok(scenario, `Missing scenario ${id}`);
  return evaluateCalibration(scenario.input);
}

test('provides a descriptive insight after seven days without recommending a change', () => {
  const result = evaluateScenario('early-insight');
  assert.equal(result.status, 'insight');
  assert.equal(result.selectedWindowDays, 7);
  assert.equal(result.recommendation, null);
});

test('does not adjust a target when intake and observed pace agree with the profile estimate', () => {
  const result = evaluateScenario('on-track');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(Math.abs(result.estimates.targetAdjustmentKcal.midpoint) < 75);
});

test('caps an actionable target correction at 150 kcal', () => {
  const result = evaluateScenario('target-too-high');
  assert.equal(result.status, 'recommendation');
  assert.equal(result.selectedWindowDays, 14);
  assert.equal(result.recommendation.adjustmentStepKcal, -150);
  assert.equal(result.recommendation.recommendedTargetKcal, 1750);
});

test('attributes slow progress to logged intake rather than changing a sound target estimate', () => {
  const result = evaluateScenario('adherence-not-target');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
});

test('keeps skipped and suspicious days in the uncertainty calculation', () => {
  const result = evaluateScenario('missing-and-suspicious');
  assert.notEqual(result.status, 'recommendation');
  assert.ok(result.dataQuality.missingDays > 0);
  assert.ok(result.dataQuality.suspiciousDays > 0);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('widen')));
});

test('never recommends a target below max(BMR, 1000 kcal)', () => {
  const result = evaluateScenario('bmr-floor');
  if (result.recommendation) {
    assert.ok(result.recommendation.recommendedTargetKcal >= 1850);
  }
});

test('is deterministic for the same history', () => {
  const scenario = getCalibrationScenario('target-too-high');
  assert.deepEqual(evaluateCalibration(scenario.input), evaluateCalibration(scenario.input));
});
