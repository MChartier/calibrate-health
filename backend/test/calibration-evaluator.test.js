const test = require('node:test');
const assert = require('node:assert/strict');

const { CALIBRATION_MODEL_VERSION, evaluateCalibration } = require('../../shared/calibration');
const { computeWeightTrend } = require('../../shared/weightTrend.ts');
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
        weightKg: trendWeightKg + uncertaintyKg * Math.sin((elapsed / Math.max(1, days - 1)) * Math.PI * 4)
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
  assert.equal(result.dataQuality.weightSpanDays, 5);
  assert.equal(result.headline, 'See how your calorie plan is working');
  assert.match(result.summary, /first estimates your average weekly weight change/);
  assert.equal(result.nextStep, 'Your first weight-trend estimate is available after 7 well-tracked food days and weigh-ins spanning 7 days.');
  assert.deepEqual(result.historyProgress, {
    stage: 'pace_check',
    observedDays: 5,
    requiredDays: 7,
    completeFoodDays: 6,
    requiredCompleteFoodDays: 7,
    weightSpanDays: 5,
    requiredWeightSpanDays: 7,
    weightPoints: 4,
    requiredWeightPoints: 2,
    restartedAfterPause: false
  });
  assert.deepEqual(result.missingCriteria, [
    'Complete at least 7 plausible food-log days with entries across multiple meals.',
    'Record weights spanning at least 7 days so average weekly weight change can be estimated.'
  ]);
  assert.doesNotMatch(`${result.headline} ${result.summary} ${result.nextStep}`, /building your calibration history|unlock an initial|track food and weight across/i);
});

test('provides a descriptive insight after seven days without recommending a change', () => {
  const result = evaluateScenario('early-insight');
  assert.equal(result.status, 'insight');
  assert.equal(result.headline, 'Your early weight-trend estimate is tracking as expected');
  assert.equal(result.selectedWindowDays, 7);
  assert.equal(result.recommendation, null);
  assert.ok(Math.abs(result.estimates.observedWeeklyWeightChangeKg.midpoint + 0.45) < 0.02);
});

test('builds the recent signal from exactly seven completed local calendar days', () => {
  const result = evaluateScenario('early-insight');
  const signal = result.signals.recent;

  assert.equal(result.signals.version, 1);
  assert.equal(result.signals.minimumDailyCalorieTargetKcal, 1650);
  assert.equal(signal.scope, 'recent_7_days');
  assert.equal(signal.startDate, '2026-07-25');
  assert.equal(signal.endDate, '2026-07-31');
  assert.equal(signal.calendarDays, 7);
  assert.equal(signal.confidenceLevel, 0.95);
  assert.equal(signal.dataQuality.confidentDays, 7);
  assert.equal(result.signals.readiness.weeklySignals.status, 'available');
});

test('converts profile-TDEE calorie balance into expected weight change with the canonical sign', () => {
  const loss = evaluateScenario('early-insight').signals.recent;
  assert.ok(Math.abs(loss.estimatedDailyDeficitKcal.midpoint - 500) < 2);
  assert.ok(Math.abs(loss.expectedWeightChangeKg.midpoint + (500 * 7) / 7700) < 0.003);
  assert.equal(loss.plannedWeightChangeKg, -0.455);

  const gainInput = cloneScenarioInput('early-insight');
  gainInput.configuredDailyDeficitKcal = -500;
  gainInput.foodDays.forEach((day) => { day.calories = 2900; });
  gainInput.recommendationsEnabled = false;
  const gain = evaluateCalibration(gainInput);
  assert.ok(gain.signals.recent.estimatedDailyDeficitKcal.midpoint < 0);
  assert.ok(gain.signals.recent.expectedWeightChangeKg.midpoint > 0);
  assert.equal(gain.signals.recent.plannedWeightChangeKg, 0.455);
  assert.equal(gain.recommendation, null);
});

test('widens the logged-calorie interval for a missing completed day instead of treating it as zero', () => {
  const completeInput = cloneScenarioInput('on-track');
  const complete = evaluateCalibration(completeInput);
  const missingInput = cloneScenarioInput('on-track');
  missingInput.foodDays = missingInput.foodDays.filter((day) => day.date !== '2026-07-31');
  const missing = evaluateCalibration(missingInput);
  const completeInterval = complete.signals.recent.estimatedDailyDeficitKcal;
  const missingInterval = missing.signals.recent.estimatedDailyDeficitKcal;

  assert.ok(missingInterval.high - missingInterval.low > completeInterval.high - completeInterval.low);
  assert.ok(missing.signals.recent.averageIntakeKcal.midpoint > 0);
  assert.equal(missing.signals.readiness.weeklySignals.status, 'building');
  assert.equal(
    missing.signals.readiness.weeklySignals.requirements
      .find((requirement) => requirement.code === 'complete_food_days').current,
    6
  );
});

test('anchors continuous long-term observed change to the stored goal-start weight', () => {
  const input = cloneScenarioInput('on-track');
  const firstDate = input.weightPoints[0].date;
  const goalStartWeightKg = input.weightPoints[0].weightKg;
  input.signalHistory = {
    goalStartDate: firstDate,
    goalStartWeightKg,
    foodDays: input.foodDays,
    weightPoints: input.weightPoints
  };
  const baseline = evaluateCalibration(input);
  input.signalHistory.goalStartWeightKg += 1;
  const shifted = evaluateCalibration(input);

  assert.equal(baseline.signals.longTerm.scope, 'since_goal_start');
  assert.ok(Math.abs(
    shifted.signals.longTerm.observedWeightChangeKg.midpoint -
    baseline.signals.longTerm.observedWeightChangeKg.midpoint +
    1
  ) < 0.001);
  assert.deepEqual(shifted.recommendation, baseline.recommendation);
});

test('never bridges a food pause or a weight-trend segment reset in long-term signals', () => {
  const paused = evaluateScenario('after-pause');
  assert.equal(paused.signals.longTerm.scope, 'since_tracking_resumed');
  assert.equal(paused.signals.longTerm.startDate, '2026-07-29');
  assert.equal(paused.signals.longTerm.calendarDays, 3);

  const resetInput = cloneScenarioInput('on-track');
  resetInput.signalHistory = {
    goalStartDate: '2026-06-01',
    goalStartWeightKg: 92,
    foodDays: resetInput.foodDays,
    weightPoints: [
      { date: '2026-06-01', weightKg: 92 },
      ...resetInput.weightPoints
    ]
  };
  const reset = evaluateCalibration(resetInput);
  assert.equal(reset.signals.longTerm.scope, 'current_tracking_period');
  assert.ok(reset.signals.longTerm.startDate >= resetInput.weightPoints[0].date);
  assert.ok(reset.signals.longTerm.calendarDays <= 28);
});

test('classifies goal pace conservatively and keeps descriptive signals for all goal types', () => {
  const aligned = evaluateScenario('on-track');
  const slower = evaluateScenario('target-too-high');
  const faster = evaluateScenario('target-too-low');
  assert.equal(aligned.signals.longTerm.goalPaceStatus, 'aligned');
  assert.equal(slower.signals.longTerm.goalPaceStatus, 'slower');
  assert.equal(slower.signals.longTerm.logsAgreementStatus, 'divergent');
  assert.equal(faster.signals.longTerm.goalPaceStatus, 'faster');

  const maintenanceInput = buildInvariantInput({
    days: 28,
    ageYears: 38,
    weeklyChangeKg: 0,
    missingEvery: 0,
    uncertaintyKg: 0.01,
    bmrKcal: 1650
  });
  maintenanceInput.configuredDailyDeficitKcal = 0;
  maintenanceInput.recommendationsEnabled = false;
  maintenanceInput.foodDays.forEach((day) => { day.calories = 2400; });
  const maintenance = evaluateCalibration(maintenanceInput);
  assert.equal(maintenance.signals.longTerm.goalPaceStatus, 'aligned');
  assert.equal(maintenance.signals.readiness.targetReview.status, 'not_eligible');
  assert.equal(maintenance.recommendation, null);

  const gainInput = buildInvariantInput({
    days: 28,
    ageYears: 38,
    weeklyChangeKg: 0.2,
    missingEvery: 0,
    uncertaintyKg: 0.01,
    bmrKcal: 1650
  });
  gainInput.configuredDailyDeficitKcal = -500;
  gainInput.recommendationsEnabled = false;
  gainInput.foodDays.forEach((day) => { day.calories = 2900; });
  const gain = evaluateCalibration(gainInput);
  assert.equal(gain.signals.longTerm.goalPaceStatus, 'slower');
  assert.equal(gain.signals.readiness.targetReview.status, 'not_eligible');
  assert.equal(gain.recommendation, null);
});

test('uses the exact 3,500 kcal/lb rule while retaining kilogram signal fields', () => {
  const kilogramsInput = cloneScenarioInput('on-track');
  const poundsInput = cloneScenarioInput('on-track');
  poundsInput.weightUnit = 'LB';
  const kilograms = evaluateCalibration(kilogramsInput).signals;
  const pounds = evaluateCalibration(poundsInput).signals;

  assert.deepEqual(pounds.recent.observedWeightChangeKg, kilograms.recent.observedWeightChangeKg);
  assert.ok(Math.abs(
    pounds.recent.expectedWeightChangeKg.midpoint * 2.2046226218 +
    (500 * 7) / 3500
  ) < 0.003);
  assert.ok(Math.abs(pounds.recent.plannedWeightChangeKg * 2.2046226218 + 1) < 0.003);
});

test('explains when food history is strong but weight history cannot establish a pace', () => {
  const result = evaluateScenario('learning-weights');
  assert.equal(result.status, 'learning');
  assert.equal(result.headline, 'A current weigh-in is needed');
  assert.match(result.summary, /14 well-tracked food days/);
  assert.match(result.summary, /latest weigh-in is too old/);
  assert.match(result.nextStep, /Record a new weigh-in/);
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
  assert.equal(result.selectedWindowDays, 21);
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

test('a post-gap pair cannot establish pace or recommend a change', () => {
  const input = cloneScenarioInput('target-too-high');
  input.weightUnit = 'LB';
  input.weightPoints = [input.weightPoints[0], input.weightPoints[input.weightPoints.length - 1]];
  const result = evaluateCalibration(input);
  assert.equal(result.status, 'learning');
  assert.equal(result.recommendation, null);
  assert.equal(result.dataQuality.weightPoints, 1);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('spanning at least 7 days')));
  assert.equal(result.historyProgress.stage, 'pace_check');
  assert.equal(result.nextStep, 'Your next weight-trend estimate is available once your weigh-ins span 7 days.');
  assert.match(result.summary, /a single weigh-in cannot establish a reliable trend/);
});

test('calibration v4 isolates selected-window pace from a strong earlier reversal', () => {
  const input = cloneScenarioInput('target-too-high');
  const baseline = evaluateCalibration(input);
  const firstWeightDate = input.weightPoints[0].date;
  input.weightPoints.unshift(
    { date: addDays(firstWeightDate, -30), weightKg: 70 },
    { date: addDays(firstWeightDate, -16), weightKg: 100 }
  );

  const result = evaluateCalibration(input);

  assert.equal(CALIBRATION_MODEL_VERSION, 4);
  assert.equal(result.modelVersion, 4);
  assert.equal(result.selectedWindowDays, baseline.selectedWindowDays);
  assert.deepEqual(result.estimates.observedWeeklyWeightChangeKg, baseline.estimates.observedWeeklyWeightChangeKg);
  assert.deepEqual(result.estimates.targetAdjustmentKcal, baseline.estimates.targetAdjustmentKcal);
  assert.equal(result.recommendation.adjustmentStepKcal, baseline.recommendation.adjustmentStepKcal);
  assert.ok(Math.abs(result.recommendation.adjustmentStepKcal) <= 150);
});

test('calibration v4 does not fall back to current velocity after a reset inside the selected window', () => {
  const input = cloneScenarioInput('target-too-high');
  const asOfDate = input.asOfDate;
  input.weightPoints = [
    { date: addDays(asOfDate, -28), weightKg: 90 },
    { date: addDays(asOfDate, -27), weightKg: 90.2 },
    { date: addDays(asOfDate, -11), weightKg: 89.8 },
    { date: addDays(asOfDate, -7), weightKg: 89.5 },
    { date: addDays(asOfDate, -3), weightKg: 89.2 },
    { date: asOfDate, weightKg: 89 }
  ];
  const trend = computeWeightTrend(input.weightPoints.map((point) => ({
    date: new Date(`${point.date}T00:00:00.000Z`),
    weight: point.weightKg
  })), {
    calibrationWindow: {
      startDate: new Date(`${addDays(asOfDate, -28)}T00:00:00.000Z`),
      endDate: new Date(`${asOfDate}T00:00:00.000Z`)
    }
  });
  const result = evaluateCalibration(input);

  assert.equal(trend.segments.length, 2);
  assert.notEqual(trend.currentRate.status, 'insufficient');
  assert.equal(trend.windowAverageRate.status, 'insufficient');
  assert.equal(Number.isFinite(trend.windowAverageRate.estimateKgPerWeek), false);
  assert.equal(result.modelVersion, 4);
  assert.equal(result.selectedWindowDays, 28);
  assert.equal(result.status, 'learning');
  assert.equal(result.estimates.observedWeeklyWeightChangeKg, null);
  assert.equal(result.estimates.targetAdjustmentKcal, null);
  assert.equal(result.recommendation, null);
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
  assert.equal(result.historyProgress.stage, 'budget_review');
  assert.equal(result.historyProgress.requiredWeightSpanDays, 14);
  assert.match(result.nextStep, /Keep tracking for 3 more days/);
});

test('attributes slow progress to logged intake rather than changing a sound target estimate', () => {
  const result = evaluateScenario('adherence-not-target');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.equal(result.headline, 'Your weight-change rate matches your logged intake');
  assert.match(result.summary, /logged about 2,200 kcal per day compared with your 1,900 kcal daily budget/);
  assert.match(result.summary, /weight trended down about 0\.19 kg per week/);
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
  assert.ok(Math.abs(result.estimates.observedWeeklyWeightChangeKg.midpoint + 0.455) < 0.02);
});

test('explains when weight uncertainty prevents a safe budget assessment', () => {
  const result = evaluateScenario('wide-weight-uncertainty');
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.equal(result.headline, 'Weight uncertainty limits this insight');
  assert.match(result.summary, /plausible weekly rate could mean losing 0\.07 to 0\.77 kg per week/);
  assert.match(result.summary, /not enough certainty to assess the calorie budget safely yet/);
  assert.match(result.nextStep, /same time of day/);
});

test('describes a broad pace range that includes both loss and gain', () => {
  const input = cloneScenarioInput('wide-weight-uncertainty');
  input.weightPoints = input.weightPoints.map((point, index) => ({
    ...point,
    weightKg: 90 + (index % 2 === 0 ? -0.9 : 0.9)
  }));
  const result = evaluateCalibration(input);
  assert.equal(result.headline, 'Weight uncertainty limits this insight');
  assert.match(result.summary, /plausible weekly rate could mean losing up to \d+\.\d{2} or gaining up to \d+\.\d{2} kg per week/);
});

test('an isolated three-kilogram spike cannot create an unsafe recommendation', () => {
  const input = cloneScenarioInput('on-track');
  const outlierIndex = Math.floor(input.weightPoints.length / 2);
  input.weightPoints[outlierIndex].weightKg += 3;
  const result = evaluateCalibration(input);

  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.equal(result.headline, 'Your progress is tracking as expected');
  assert.ok(result.estimates.observedWeeklyWeightChangeKg.high < 0);
});

test('stale and outdated weigh-ins cannot trigger a calorie-budget recommendation', () => {
  const staleInput = cloneScenarioInput('target-too-high');
  const staleCutoff = addDays(staleInput.asOfDate, -10);
  staleInput.weightPoints = staleInput.weightPoints.filter((point) => point.date <= staleCutoff);
  const staleResult = evaluateCalibration(staleInput);
  assert.equal(staleResult.status, 'insight');
  assert.equal(staleResult.headline, 'A current weigh-in is needed');
  assert.equal(staleResult.recommendation, null);
  assert.notEqual(staleResult.estimates.observedWeeklyWeightChangeKg, null);

  const outdatedInput = cloneScenarioInput('target-too-high');
  const outdatedCutoff = addDays(outdatedInput.asOfDate, -15);
  outdatedInput.weightPoints = outdatedInput.weightPoints.filter((point) => point.date <= outdatedCutoff);
  const outdatedResult = evaluateCalibration(outdatedInput);
  assert.equal(outdatedResult.status, 'learning');
  assert.equal(outdatedResult.headline, 'A current weigh-in is needed');
  assert.equal(outdatedResult.recommendation, null);
  assert.equal(outdatedResult.estimates.observedWeeklyWeightChangeKg, null);
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

test('a fractional BMR cannot generate a recommendation below the canonical ceiling floor', () => {
  const input = cloneScenarioInput('bmr-floor');
  input.bmrKcal = 1900.1;
  input.profileTdeeKcal = 2250.1;
  const result = evaluateCalibration(input);

  assert.equal(result.status, 'recommendation');
  assert.equal(result.recommendation.adjustmentStepKcal, -75);
  assert.equal(result.recommendation.recommendedTargetKcal, 1925);
  assert.ok(result.recommendation.recommendedTargetKcal >= Math.ceil(input.bmrKcal));
});

test('does not reverse recommendation direction when the current target is below the BMR floor', () => {
  const result = evaluateScenario('bmr-floor-blocked');
  assert.ok(result.estimates.targetAdjustmentKcal.midpoint < 0);
  assert.equal(result.status, 'insight');
  assert.equal(result.recommendation, null);
  assert.ok(result.missingCriteria.some((criterion) => criterion.includes('BMR-based limit')));
  assert.equal(result.headline, "Calibrate won't recommend a lower budget");
  assert.match(result.summary, /logged about 1,750 kcal per day/);
  assert.match(result.summary, /weight trended up about 0\.04 kg per week versus a projected loss of 0\.46 kg per week/);
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

test('does not surface unused activity data and caps the selected window at 42 days', () => {
  const onTrack = evaluateScenario('on-track');
  const withActivity = evaluateScenario('activity-context');
  assert.deepEqual(withActivity.estimates.targetAdjustmentKcal, onTrack.estimates.targetAdjustmentKcal);
  assert.equal(withActivity.activityContext, null);

  const maximumWindow = evaluateScenario('maximum-window');
  assert.equal(maximumWindow.selectedWindowDays, 42);
  assert.equal(maximumWindow.dataQuality.observationDays, 42);
});

test('restarts evidence after the latest tracking pause instead of averaging across the break', () => {
  const input = cloneScenarioInput('target-too-high');
  for (const day of input.foodDays) {
    day.isPaused = day.date >= '2026-07-18' && day.date <= '2026-07-28';
  }

  const result = evaluateCalibration(input);

  assert.equal(result.status, 'not_ready');
  assert.equal(result.headline, 'Gathering new history after your break');
  assert.match(result.summary, /history from before your break are excluded/);
  assert.equal(result.dataQuality.observationDays, 3);
  assert.equal(result.dataQuality.confidentDays, 3);
  assert.equal(result.dataQuality.incompleteDays, 0);
  assert.equal(result.dataQuality.missingDays, 0);
  assert.equal(result.historyProgress.restartedAfterPause, true);
  assert.equal(result.historyProgress.completeFoodDays, 3);
  assert.match(result.nextStep, /next weight-trend estimate is available after 7 well-tracked food days/);
});

test('acknowledges an active pause that starts after the latest completed evidence day', () => {
  const input = cloneScenarioInput('target-too-high');
  input.trackingPaused = true;

  const result = evaluateCalibration(input);

  assert.equal(result.status, 'not_ready');
  assert.equal(result.headline, 'Calibration is paused with food tracking');
  assert.equal(result.summary, 'Paused days are excluded from calibration, so your break is not treated as uncertain intake.');
  assert.equal(result.nextStep, 'After you resume, your next weight-trend estimate will be available after 7 well-tracked food days and weigh-ins spanning 7 days.');
  assert.equal(result.dataQuality.observationDays, 0);
  assert.equal(result.historyProgress.restartedAfterPause, true);
  assert.equal(result.recommendation, null);
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
