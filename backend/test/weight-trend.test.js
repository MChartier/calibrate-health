const test = require('node:test');
const assert = require('node:assert/strict');

const { computeWeightTrend } = require('../src/services/weightTrend');

function addDays(startDate, days) {
  const next = new Date(startDate);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

test('computeWeightTrend: keeps a stable trend for mostly flat weight series', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const observations = Array.from({ length: 10 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: 80 + (index % 2 === 0 ? 0.2 : -0.2)
  }));

  const result = computeWeightTrend(observations, 'KG');
  assert.equal(result.points.length, observations.length);
  assert.ok(result.points.every((point) => Number.isFinite(point.trendWeight)));
  assert.ok(result.points.every((point) => Number.isFinite(point.lower95)));
  assert.ok(result.points.every((point) => Number.isFinite(point.upper95)));

  const latestTrend = result.points[result.points.length - 1].trendWeight;
  assert.ok(Math.abs(latestTrend - 80) < 1.2);
});

test('computeWeightTrend: dampens a short-lived spike', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const base = [80, 79.8, 79.7, 79.6, 79.5, 81.5, 79.4, 79.3, 79.2];
  const observations = base.map((weight, index) => ({
    date: addDays(start, index),
    weight
  }));

  const result = computeWeightTrend(observations, 'KG');
  const spikeIndex = 5;

  const rawJump = observations[spikeIndex].weight - observations[spikeIndex - 1].weight;
  const trendJump = result.points[spikeIndex].trendWeight - result.points[spikeIndex - 1].trendWeight;

  assert.ok(trendJump > 0, 'trend should react in the same direction');
  assert.ok(Math.abs(trendJump) < Math.abs(rawJump), 'trend should react less than raw measurement');
});

test('computeWeightTrend: widens uncertainty under high volatility', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const lowNoise = Array.from({ length: 20 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: 80 - index * 0.08 + (index % 2 === 0 ? 0.15 : -0.1)
  }));
  const highNoise = Array.from({ length: 20 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: 80 - index * 0.08 + (index % 2 === 0 ? 1.3 : -1.1)
  }));

  const lowResult = computeWeightTrend(lowNoise, 'KG');
  const highResult = computeWeightTrend(highNoise, 'KG');

  const lowStdMedian = median(lowResult.points.map((point) => point.trendStd));
  const highStdMedian = median(highResult.points.map((point) => point.trendStd));

  assert.ok(highStdMedian > lowStdMedian);
  assert.ok(['low', 'medium', 'high'].includes(lowResult.volatility));
  assert.ok(['low', 'medium', 'high'].includes(highResult.volatility));
});

test('computeWeightTrend: supports sparse histories with finite defaults', () => {
  const observations = [{ date: new Date('2025-01-01T00:00:00Z'), weight: 180 }];

  const result = computeWeightTrend(observations, 'LB');
  assert.equal(result.points.length, 1);
  assert.ok(Number.isFinite(result.points[0].trendWeight));
  assert.ok(Number.isFinite(result.points[0].trendStd));
  assert.ok(Number.isFinite(result.points[0].lower95));
  assert.ok(Number.isFinite(result.points[0].upper95));
  assert.equal(result.weeklyRate, 0);
});

test('computeWeightTrend: caps uncertainty growth across very large date gaps', () => {
  const observations = [
    { date: new Date('2012-01-01T00:00:00Z'), weight: 178 },
    { date: new Date('2012-01-02T00:00:00Z'), weight: 177.5 },
    { date: new Date('2026-01-01T00:00:00Z'), weight: 171.8 },
  ];

  const result = computeWeightTrend(observations, 'LB');
  assert.equal(result.points.length, 3);

  const firstPointAfterGap = result.points[2];
  const rangeWidth = firstPointAfterGap.upper95 - firstPointAfterGap.lower95;

  // We still allow wider intervals after sparse periods, but avoid exploding to implausible spans.
  assert.ok(rangeWidth < 8);
});

test('computeWeightTrend: reports a 95% confidence interval around the trend estimate', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const observations = Array.from({ length: 90 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: 180 - index * 0.06 + (index % 2 === 0 ? 1.1 : -0.95) + (index % 13 === 0 ? 1.6 : 0),
  }));

  const result = computeWeightTrend(observations, 'LB');
  for (const point of result.points) {
    const expectedLower = point.trendWeight - 1.96 * point.trendStd;
    const expectedUpper = point.trendWeight + 1.96 * point.trendStd;

    assert.ok(Math.abs(point.lower95 - expectedLower) < 1e-9);
    assert.ok(Math.abs(point.upper95 - expectedUpper) < 1e-9);
  }
});
