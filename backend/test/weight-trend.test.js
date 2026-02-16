const test = require('node:test');
const assert = require('node:assert/strict');

const { computeWeightTrend } = require('../src/services/weightTrend');

const LB_TO_KG = 0.45359237;

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

function computeUnweightedSlopePerDay(observations) {
  if (observations.length < 2) return 0;

  const startMs = observations[0].date.getTime();
  const xValues = observations.map((observation) => (observation.date.getTime() - startMs) / (24 * 60 * 60 * 1000));
  const yValues = observations.map((observation) => observation.weight);

  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xValues.length; i += 1) {
    const xCentered = xValues[i] - xMean;
    numerator += xCentered * (yValues[i] - yMean);
    denominator += xCentered * xCentered;
  }

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

test('computeWeightTrend: keeps a stable trend for mostly flat weight series', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const observations = Array.from({ length: 10 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: 80 + (index % 2 === 0 ? 0.2 : -0.2)
  }));

  const result = computeWeightTrend(observations);
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

  const result = computeWeightTrend(observations);
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

  const lowResult = computeWeightTrend(lowNoise);
  const highResult = computeWeightTrend(highNoise);

  const lowStdMedian = median(lowResult.points.map((point) => point.trendStd));
  const highStdMedian = median(highResult.points.map((point) => point.trendStd));

  assert.ok(highStdMedian > lowStdMedian);
  assert.ok(['low', 'medium', 'high'].includes(lowResult.volatility));
  assert.ok(['low', 'medium', 'high'].includes(highResult.volatility));
});

test('computeWeightTrend: supports sparse histories with finite defaults', () => {
  const observations = [{ date: new Date('2025-01-01T00:00:00Z'), weight: 180 * LB_TO_KG }];

  const result = computeWeightTrend(observations);
  assert.equal(result.points.length, 1);
  assert.ok(Number.isFinite(result.points[0].trendWeight));
  assert.ok(Number.isFinite(result.points[0].trendStd));
  assert.ok(Number.isFinite(result.points[0].lower95));
  assert.ok(Number.isFinite(result.points[0].upper95));
  assert.equal(result.weeklyRate, 0);
});

test('computeWeightTrend: caps uncertainty growth across very large date gaps', () => {
  const observations = [
    { date: new Date('2012-01-01T00:00:00Z'), weight: 178 * LB_TO_KG },
    { date: new Date('2012-01-02T00:00:00Z'), weight: 177.5 * LB_TO_KG },
    { date: new Date('2026-01-01T00:00:00Z'), weight: 171.8 * LB_TO_KG },
  ];

  const result = computeWeightTrend(observations);
  assert.equal(result.points.length, 3);

  const firstPointAfterGap = result.points[2];
  const rangeWidth = firstPointAfterGap.upper95 - firstPointAfterGap.lower95;

  // We still allow wider intervals after sparse periods, but avoid exploding to implausible spans.
  assert.ok(rangeWidth < 8 * LB_TO_KG);
});

test('computeWeightTrend: reports a 95% confidence interval around the trend estimate', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const observations = Array.from({ length: 90 }, (_unused, index) => ({
    date: addDays(start, index),
    weight: (180 - index * 0.06 + (index % 2 === 0 ? 1.1 : -0.95) + (index % 13 === 0 ? 1.6 : 0)) * LB_TO_KG,
  }));

  const result = computeWeightTrend(observations);
  for (const point of result.points) {
    const expectedLower = point.trendWeight - 1.96 * point.trendStd;
    const expectedUpper = point.trendWeight + 1.96 * point.trendStd;

    assert.ok(Math.abs(point.lower95 - expectedLower) < 1e-9);
    assert.ok(Math.abs(point.upper95 - expectedUpper) < 1e-9);
  }
});

test('computeWeightTrend: anchors the first trend point to the first observation', () => {
  const observations = [
    { date: new Date('2025-01-01T00:00:00Z'), weight: 80.5 },
    { date: new Date('2025-01-02T00:00:00Z'), weight: 80.3 },
    { date: new Date('2025-01-03T00:00:00Z'), weight: 80.1 }
  ];

  const result = computeWeightTrend(observations);
  assert.equal(result.points.length, observations.length);
  assert.equal(result.points[0].trendWeight, observations[0].weight);
  assert.ok(Number.isFinite(result.points[0].trendStd));
  assert.ok(result.points[0].lower95 <= result.points[0].trendWeight);
  assert.ok(result.points[0].upper95 >= result.points[0].trendWeight);
});

test('computeWeightTrend: recency-weighted drift adapts when recent direction differs from long-run history', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const observations = [];

  // Older period: gradual gain over ~5 months.
  for (let index = 0; index < 140; index += 1) {
    observations.push({
      date: addDays(start, index),
      weight: 75 + (6 / 139) * index + (index % 2 === 0 ? -0.15 : 0.15)
    });
  }

  // Recent period: sustained loss over ~6 weeks.
  for (let day = 0; day < 45; day += 1) {
    observations.push({
      date: addDays(start, 140 + day),
      weight: 81 - (4 / 44) * day + (day % 2 === 0 ? -0.2 : 0.2)
    });
  }

  const result = computeWeightTrend(observations);
  const unweightedSlope = computeUnweightedSlopePerDay(observations);

  assert.ok(unweightedSlope > 0, 'global unweighted slope should reflect the longer historical gain');
  assert.ok(result.params.driftPerDay < 0, 'recency-weighted drift should align with the recent loss period');
});
