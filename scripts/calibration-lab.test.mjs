import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCalibrationLabServer, parseCalibrationInput } from './calibration-lab.mjs';
import {
  formatBudgetChange,
  formatBudgetInterval,
  formatDayCount,
  getWindowMetric
} from '../tools/calibration-lab/presentation.mjs';

const labStyles = await readFile(new URL('../tools/calibration-lab/styles.css', import.meta.url), 'utf8');

const validInput = {
  asOfDate: '2026-07-31',
  ageYears: 38,
  bmrKcal: 1650,
  profileTdeeKcal: 2400,
  configuredDailyDeficitKcal: 500,
  currentTargetAdjustmentKcal: 0,
  foodDays: [{
    date: '2026-07-31',
    calories: 1900,
    entryCount: 3,
    mealPeriodCount: 3,
    isComplete: true
  }],
  weightPoints: [{
    date: '2026-07-31',
    trendWeightKg: 90,
    lowerKg: 89.9,
    upperKg: 90.1
  }]
};

test('calibration lab accepts a complete editable history shape', () => {
  assert.equal(parseCalibrationInput(validInput), validInput);
});

test('calibration lab rejects malformed nested history before evaluation', () => {
  assert.throws(
    () => parseCalibrationInput({ ...validInput, foodDays: [{ ...validInput.foodDays[0], calories: '1900' }] }),
    /foodDays\[0\]\.calories must be a finite number/
  );
  assert.throws(
    () => parseCalibrationInput({ ...validInput, weightPoints: [{ ...validInput.weightPoints[0], lowerKg: 91 }] }),
    /lowerKg cannot exceed upperKg/
  );
});

test('calibration lab hides empty optional sections', () => {
  assert.match(labStyles, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('calibration lab describes pre-threshold history without implying the window is absent', () => {
  assert.deepEqual(getWindowMetric({
    selectedWindowDays: null,
    dataQuality: { observationDays: 6 }
  }), {
    label: 'history observed',
    value: '6 days'
  });
});

test('calibration lab labels a qualifying evaluator window explicitly', () => {
  assert.deepEqual(getWindowMetric({
    selectedWindowDays: 14,
    dataQuality: { observationDays: 28 }
  }), {
    label: 'evaluation window',
    value: '14 days'
  });
  assert.equal(formatDayCount(1), '1 day');
});

test('calibration lab describes budget changes without ambiguous signs', () => {
  assert.equal(formatBudgetChange(-150), '150 kcal less');
  assert.equal(formatBudgetChange(150), '150 kcal more');
  assert.equal(formatBudgetInterval({ low: -291, midpoint: -246, high: -198 }), '246 kcal/day lower (198 to 291)');
  assert.equal(formatBudgetInterval({ low: 279, midpoint: 327, high: 373 }), '327 kcal/day higher (279 to 373)');
});

test('calibration lab serves the window-presentation module', async (context) => {
  const server = createCalibrationLabServer({ evaluateCalibration: () => ({}), scenarios: [] });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/presentation.mjs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.match(await response.text(), /export function getWindowMetric/);
});
