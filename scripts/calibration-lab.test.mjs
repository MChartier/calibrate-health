import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCalibrationInput } from './calibration-lab.mjs';

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
