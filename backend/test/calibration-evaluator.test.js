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
    weightUnit: 'KG',
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
  assert.equal(result.headline, 'See how your calorie plan is working');
  assert.match(result.summary, /whether your plan is on track or a small calorie-budget adjustment/);
  assert.equal(result.nextStep, 'Keep following your current plan and log food and weight consistently so Calibrate can make its first pace check.');
  assert.deepEqual(result.historyProgress, { observedDays: 6, requiredDays: 7 });
  assert.deepEqual(result.missingCriteria, ['Build at least 7 days of food and weight history.']);
  assert.doesNotMatch(`${result.headline} ${result.summary} ${result.nextStep}`, /building your calibration history|unlock an initial|track food and weight across/i);
});

test('provides a descriptive insight after seven days without recommending a change', () => {
  const result = evaluateScenario('early-insight');
  assert.equal(result.status, 'insight');
  assert.equal(result.headline, 'Your early pace check is tracking as expected');
  assert.equal(result.selectedWindowDays, 7);
  assert.equal(result.recommendation, null);
  assert.ok(Math.abs(result.estimates.observedWeeklyWeightChangeKg.midpoint + 0.45) < 0.01);
});

test('explains when food history is strong but weight history cannot establish a pace', () => {
  const result = evaluateScenario('learning-weights');
  assert.equal(result.status, 'learning');
  assert.equal(result.headline, 'More weight history is needed');
  assert.match(result.summary, /14 well-tracked food days/);
  assert.match(result.summary, /a single weigh-in cannot establish a reliable trend/);
  assert.equal(result.nextStep, 'Add more weigh-ins until they span at least 7 days so Calibrate can estimate your pace.');
  assert.doesNotMatch(result.summary, /missing days/i);
});

test('uses natural learning copy before any weights are recorded', () => {
  const input = cloneScenarioInput('learning-weights');
  input.weightPoints = [];
  const result = evaluateCalibration(input);
  assert.equal(result.status, 'learning');
  assert.match(result.summary, /no weigh-ins have been recorded yet/);
  assert.doesNotMatch(result.summary, /0 weigh-ins/);
});

test('does not adjust a target when intake and observed pace agree with the profile estimate', () => {
  const result = evaluateScenario('on-track');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(Math.abs(result.estimates.targetAdjustmentKcal.midpoint) < 75);
  assert.equal(result.headline, 'Your progress is tracking as expected');
  assert.match(result.summary, /The evidence shows progress is consistent with tracking expectations\./);
  assert.doesNotMatch(result.summary, /target change/i);
});

test('caps an actionable target correction at 150 kcal', () => {
  const result = evaluateScenario('target-too-high');
  assert.equal(result.status, 'recommendation');
  assert.equal(result.selectedWindowDays, 14);
  assert.equal(result.recommendation.adjustmentStepKcal, -150);
  assert.equal(result.recommendation.recommendedTargetKcal, 1750);
  assert.equal(result.headline, "You're losing weight, but slower than planned");
  assert.match(result.summary, /logged about 1,900 kcal per day/);
  assert.match(result.summary, /weight trended down about 0\.23 kg per week versus a projected loss of 0\.46 kg per week/);
  assert.match(result.summary, /150 kcal lower daily calorie budget/);
  assert.doesNotMatch(result.summary, /approval|target decrease|change the daily target/i);
});

test('caps an upward target correction at 150 kcal', () => {
  const result = evaluateScenario('target-too-low');
  assert.equal(result.status, 'recommendation');
  assert.equal(result.recommendation.adjustmentStepKcal, 150);
  assert.equal(result.recommendation.recommendedTargetKcal, 2050);
  assert.equal(result.headline, "You're losing weight faster than planned");
  assert.match(result.summary, /weight trended down about 0\.75 kg per week versus a projected loss of 0\.46 kg per week/);
  assert.match(result.summary, /150 kcal higher daily calorie budget/);
  assert.doesNotMatch(result.summary, /approval|target increase|change the daily target/i);
});

test('requires at least three weights before recommending a change', () => {
  const input = cloneScenarioInput('target-too-high');
  input.weightUnit = 'LB';
  input.weightPoints = [input.weightPoints[0], input.weightPoints[input.weightPoints.length - 1]];
  const result = evaluateCalibration(input);
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('at least 3 weights')));
  assert.match(result.summary, /remaining evidence criteria explain what would make this comparison more reliable/);
  assert.match(result.summary, /lb per week/);
  assert.doesNotMatch(result.summary, /kg per week/);
  assert.doesNotMatch(result.summary, /target change is not available yet/i);
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
  assert.equal(result.headline, 'Your pace matches your logged intake');
  assert.match(result.summary, /logged about 2,200 kcal per day compared with your 1,900 kcal daily budget/);
  assert.match(result.summary, /weight trended down about 0\.18 kg per week/);
  assert.match(result.summary, /calorie budget estimate itself appears sound/);
  assert.match(result.nextStep, /aim to average nearer your current 1,900 kcal budget/);
});

test('keeps skipped and suspicious days in the uncertainty calculation', () => {
  const result = evaluateScenario('missing-and-suspicious');
  assert.notEqual(result.status, 'recommendation');
  assert.ok(result.dataQuality.missingDays > 0);
  assert.ok(result.dataQuality.suspiciousDays > 0);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('widen')));
  assert.equal(result.headline, 'Food-log uncertainty limits this insight');
  assert.match(result.summary, /11 uncertain food days widen the calorie-budget estimate/);
});

test('preserves unusually high logged totals inside non-confident intake ranges', () => {
  const input = cloneScenarioInput('target-too-high');
  input.foodDays = input.foodDays.map((day) => ({ ...day, calories: 6000, isComplete: false }));
  const result = evaluateCalibration(input);
  assert.ok(result.estimates.averageIntakeKcal.low >= 6000);
  assert.equal(result.recommendation, null);
});

test('uses the configured display unit in user-facing pace copy while retaining kg estimates', () => {
  const input = cloneScenarioInput('on-track');
  input.weightUnit = 'LB';
  const result = evaluateCalibration(input);
  assert.equal(result.weightUnit, 'LB');
  assert.match(result.summary, /1\.00 lb per week/);
  assert.doesNotMatch(result.summary, /kg per week/);
  assert.ok(Math.abs(result.estimates.observedWeeklyWeightChangeKg.midpoint + 0.455) < 0.01);
});

test('explains when weight uncertainty prevents a safe budget assessment', () => {
  const result = evaluateScenario('wide-weight-uncertainty');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.equal(result.headline, 'Weight uncertainty limits this insight');
  assert.match(result.summary, /plausible pace could mean losing 0\.04 to 0\.43 kg per week/);
  assert.match(result.summary, /not enough certainty to assess the calorie budget safely yet/);
  assert.match(result.nextStep, /same time of day/);
});

test('describes a broad pace range that includes both loss and gain', () => {
  const input = cloneScenarioInput('wide-weight-uncertainty');
  input.weightPoints = input.weightPoints.map((point) => ({
    ...point,
    trendWeightKg: 90,
    lowerKg: 89.5,
    upperKg: 90.5
  }));
  const result = evaluateCalibration(input);
  assert.equal(result.headline, 'Weight uncertainty limits this insight');
  assert.match(result.summary, /plausible pace could mean losing up to \d+\.\d{2} or gaining up to \d+\.\d{2} kg per week/);
});

test('truncates a supported decrease when the normal step would cross the BMR floor', () => {
  const result = evaluateScenario('bmr-floor');
  assert.equal(result.status, 'recommendation');
  assert.equal(result.headline, 'Weight is trending up instead of down');
  assert.ok(result.estimates.targetAdjustmentKcal.midpoint < -150);
  assert.equal(result.recommendation.currentTargetKcal, 2000);
  assert.equal(result.recommendation.adjustmentStepKcal, -100);
  assert.equal(result.recommendation.recommendedTargetKcal, 1900);
  assert.ok(result.recommendation.currentTargetKcal - 150 < 1900);
});

test('does not reverse recommendation direction when the current target is below the BMR floor', () => {
  const result = evaluateScenario('bmr-floor-blocked');
  assert.ok(result.estimates.targetAdjustmentKcal.midpoint < 0);
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('BMR-based limit')));
  assert.equal(result.headline, "Calibrate won't recommend a lower budget");
  assert.match(result.summary, /logged about 1,750 kcal per day/);
  assert.match(result.summary, /weight trended up about 0\.05 kg per week versus a projected loss of 0\.46 kg per week/);
  assert.match(result.summary, /current 1,750 kcal daily budget is already below Calibrate's BMR-based limit of 1,850 kcal/);
  assert.match(result.summary, /Calibrate won't reduce it further/);
  assert.match(result.nextStep, /Calibrate won't lower your current budget/);
  assert.match(result.nextStep, /qualified health professional first/);
  assert.doesNotMatch(result.summary, /more consistent evidence/i);
});

test('uses singular grammar for one uncertain day', () => {
  const missingInput = cloneScenarioInput('target-too-high');
  missingInput.foodDays.pop();
  const missingResult = evaluateCalibration(missingInput);
  assert.ok(missingResult.missingCriteria.includes('1 day has no food log, so its intake remains uncertain.'));

  const suspiciousInput = cloneScenarioInput('target-too-high');
  suspiciousInput.foodDays[suspiciousInput.foodDays.length - 1].entryCount = 1;
  suspiciousInput.foodDays[suspiciousInput.foodDays.length - 1].mealPeriodCount = 1;
  const suspiciousResult = evaluateCalibration(suspiciousInput);
  assert.ok(suspiciousResult.missingCriteria.includes('1 day was marked complete but did not provide a plausible full-day total, so it widens the estimate.'));
});

test('covers pounds in the lab and preserves maintenance and gain evaluator direction', () => {
  const pounds = evaluateScenario('on-track-pounds');
  assert.equal(pounds.status, 'insight');
  assert.match(pounds.summary, /1\.00 lb per week/);
  assert.doesNotMatch(pounds.summary, /kg per week/);

  const maintenanceInput = buildInvariantInput({
    days: 28,
    ageYears: 38,
    weeklyChangeKg: -0.3,
    missingEvery: 0,
    uncertaintyKg: 0.04,
    bmrKcal: 1650
  });
  maintenanceInput.configuredDailyDeficitKcal = 0;
  maintenanceInput.foodDays.forEach((day) => { day.calories = 2400; });
  const maintenance = evaluateCalibration(maintenanceInput);
  assert.equal(maintenance.status, 'recommendation');
  assert.equal(maintenance.headline, 'Weight is trending down instead of staying steady');
  assert.equal(maintenance.recommendation.adjustmentStepKcal, 150);
  assert.match(maintenance.summary, /steady-weight projection/);

  const gainInput = buildInvariantInput({
    days: 28,
    ageYears: 38,
    weeklyChangeKg: 0.23,
    missingEvery: 0,
    uncertaintyKg: 0.04,
    bmrKcal: 1650
  });
  gainInput.configuredDailyDeficitKcal = -500;
  gainInput.foodDays.forEach((day) => { day.calories = 2900; });
  const gain = evaluateCalibration(gainInput);
  assert.equal(gain.status, 'recommendation');
  assert.equal(gain.headline, "You're gaining weight, but slower than planned");
  assert.equal(gain.recommendation.adjustmentStepKcal, 150);
  assert.match(gain.summary, /projected gain of 0\.46 kg per week/);
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

test('is invariant to food and weight input ordering', () => {
  const input = cloneScenarioInput('target-too-high');
  const reordered = {
    ...input,
    foodDays: input.foodDays.slice().reverse(),
    weightPoints: input.weightPoints.slice().reverse()
  };
  assert.deepEqual(evaluateCalibration(reordered), evaluateCalibration(input));
});
