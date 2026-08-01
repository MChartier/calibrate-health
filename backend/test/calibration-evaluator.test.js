const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateCalibration } = require('../../shared/calibration');
const { getCalibrationScenario } = require('../../shared/calibrationScenarios');

function evaluateScenario(id) {
  const scenario = getCalibrationScenario(id);
  assert.ok(scenario, `Missing scenario ${id}`);
  return evaluateCalibration(scenario.input);
}

function cloneScenarioInput(id) {
  const scenario = getCalibrationScenario(id);
  assert.ok(scenario, `Missing scenario ${id}`);
  return JSON.parse(JSON.stringify(scenario.input));
}

function addDays(date, delta) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function buildInvariantInput({ days, ageYears, weeklyChangeKg, missingEvery, uncertaintyKg, bmrKcal }) {
  const asOfDate = '2026-07-31';
  const foodDays = [];
  const weightPoints = [];
  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const index = offset + days;
    if (!missingEvery || index % missingEvery !== 0) {
      foodDays.push({
        date: addDays(asOfDate, offset),
        calories: 1900,
        entryCount: 5,
        mealPeriodCount: 3,
        isComplete: true
      });
    }
    if ((offset + days - 1) % 2 === 0 || offset === 0) {
      const elapsed = offset + days - 1;
      const trendWeightKg = 90 + (weeklyChangeKg * elapsed) / 7;
      weightPoints.push({
        date: addDays(asOfDate, offset),
        trendWeightKg,
        lowerKg: trendWeightKg - uncertaintyKg,
        upperKg: trendWeightKg + uncertaintyKg
      });
    }
  }
  return {
    asOfDate,
    ageYears,
    bmrKcal,
    profileTdeeKcal: 2400,
    configuredDailyDeficitKcal: 500,
    currentTargetAdjustmentKcal: 0,
    foodDays,
    weightPoints
  };
}

test('reports progress before the seven-day insight threshold', () => {
  const result = evaluateScenario('not-ready');
  assert.equal(result.status, 'not_ready');
  assert.equal(result.dataQuality.confidentDays, 6);
  assert.equal(result.dataQuality.weightSpanDays, 6);
});

test('provides a descriptive insight after seven days without recommending a change', () => {
  const result = evaluateScenario('early-insight');
  assert.equal(result.status, 'insight');
  assert.equal(result.selectedWindowDays, 7);
  assert.equal(result.recommendation, null);
  assert.ok(Math.abs(result.estimates.observedWeeklyWeightChangeKg.midpoint + 0.45) < 0.01);
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

test('caps an upward target correction at 150 kcal', () => {
  const result = evaluateScenario('target-too-low');
  assert.equal(result.status, 'recommendation');
  assert.equal(result.recommendation.adjustmentStepKcal, 150);
  assert.equal(result.recommendation.recommendedTargetKcal, 2050);
});

test('requires at least three weights before recommending a change', () => {
  const input = cloneScenarioInput('target-too-high');
  input.weightPoints = [input.weightPoints[0], input.weightPoints[input.weightPoints.length - 1]];
  const result = evaluateCalibration(input);
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('at least 3 weights')));
});

test('explains the 14-day action threshold when directional evidence appears earlier', () => {
  const input = cloneScenarioInput('target-too-high');
  input.foodDays = input.foodDays.slice(-13);
  const firstDate = input.foodDays[0].date;
  input.weightPoints = input.weightPoints.filter((point) => point.date >= firstDate);
  const result = evaluateCalibration(input);
  assert.equal(result.selectedWindowDays, 13);
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('at least 14 days')));
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

test('does not reverse recommendation direction when the current target is below the BMR floor', () => {
  const result = evaluateScenario('bmr-floor-blocked');
  assert.ok(result.estimates.targetAdjustmentKcal.midpoint < 0);
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('at or below')));
});

test('uses singular grammar for one uncertain day', () => {
  const missingInput = cloneScenarioInput('target-too-high');
  missingInput.foodDays.pop();
  const missingResult = evaluateCalibration(missingInput);
  assert.ok(missingResult.missingCriteria.includes('1 uncompleted or missing day widens the estimate.'));

  const suspiciousInput = cloneScenarioInput('target-too-high');
  suspiciousInput.foodDays[suspiciousInput.foodDays.length - 1].entryCount = 1;
  suspiciousInput.foodDays[suspiciousInput.foodDays.length - 1].mealPeriodCount = 1;
  const suspiciousResult = evaluateCalibration(suspiciousInput);
  assert.ok(suspiciousResult.missingCriteria.includes('1 completed day looks incomplete and widens the estimate.'));
});

test('keeps activity observational and caps the selected window at 42 days', () => {
  const onTrack = evaluateScenario('on-track');
  const withActivity = evaluateScenario('activity-context');
  assert.deepEqual(withActivity.estimates.targetAdjustmentKcal, onTrack.estimates.targetAdjustmentKcal);
  assert.equal(withActivity.activityContext.observedDays, 28);

  const maximumWindow = evaluateScenario('maximum-window');
  assert.equal(maximumWindow.selectedWindowDays, 42);
  assert.equal(maximumWindow.dataQuality.observationDays, 42);
});

test('preserves calibration safety invariants across a broad deterministic matrix', () => {
  let evaluated = 0;
  for (const days of [6, 7, 13, 14, 21, 42]) {
    for (const ageYears of [17, 38]) {
      for (const weeklyChangeKg of [-0.8, -0.455, -0.23, 0.05]) {
        for (const missingEvery of [0, 4]) {
          for (const uncertaintyKg of [0.04, 0.5]) {
            for (const bmrKcal of [1650, 1900]) {
              const input = buildInvariantInput({ days, ageYears, weeklyChangeKg, missingEvery, uncertaintyKg, bmrKcal });
              const result = evaluateCalibration(input);
              evaluated += 1;

              for (const estimate of Object.values(result.estimates)) {
                if (!estimate || typeof estimate === 'number') continue;
                assert.ok(Number.isFinite(estimate.low));
                assert.ok(estimate.low <= estimate.midpoint);
                assert.ok(estimate.midpoint <= estimate.high);
              }

              if (!result.recommendation) {
                assert.notEqual(result.status, 'recommendation');
                continue;
              }

              const recommendation = result.recommendation;
              const desiredDirection = Math.sign(result.estimates.targetAdjustmentKcal.midpoint - input.currentTargetAdjustmentKcal);
              assert.equal(result.status, 'recommendation');
              assert.equal(Math.sign(recommendation.adjustmentStepKcal), desiredDirection);
              assert.ok(Math.abs(recommendation.adjustmentStepKcal) <= 150);
              assert.equal(Math.abs(recommendation.adjustmentStepKcal) % 25, 0);
              assert.ok(result.selectedWindowDays >= 14);
              assert.ok(result.dataQuality.weightPoints >= 3);
              assert.ok(result.dataQuality.weightSpanDays >= 14);
              assert.ok(result.dataQuality.confidentDays >= 7);
              assert.ok(ageYears >= 18);
              if (recommendation.adjustmentStepKcal < 0) {
                assert.ok(recommendation.recommendedTargetKcal >= Math.max(bmrKcal, 1000));
              }
            }
          }
        }
      }
    }
  }
  assert.equal(evaluated, 384);
});

test('is deterministic for the same history', () => {
  const scenario = getCalibrationScenario('target-too-high');
  assert.deepEqual(evaluateCalibration(scenario.input), evaluateCalibration(scenario.input));
});
