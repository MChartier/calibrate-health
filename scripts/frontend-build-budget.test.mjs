import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateBudgets, formatReport } from './frontend-build-budget.mjs';

const measurements = {
  initial: [{ file: 'assets/app.js', bytes: 800, gzip_bytes: 300 }],
  async: [{ file: 'assets/scanner.js', bytes: 200, gzip_bytes: 80 }],
  initial_javascript_bytes: 800,
  initial_javascript_gzip_bytes: 300,
  largest_async_javascript_bytes: 200,
  service_worker_bytes: 100,
};

test('budgets accept measurements at or below every limit', () => {
  assert.deepEqual(evaluateBudgets(measurements, {
    initial_javascript_bytes: 800,
    initial_javascript_gzip_bytes: 300,
    largest_async_javascript_bytes: 200,
    service_worker_bytes: 100,
  }), []);
});

test('budgets report every exceeded or invalid metric', () => {
  assert.deepEqual(evaluateBudgets(measurements, {
    initial_javascript_bytes: 799,
    service_worker_bytes: 0,
    missing_metric: 10,
  }), [
    'initial_javascript_bytes is 800 bytes; budget is 799 bytes.',
    'service_worker_bytes has an invalid budget: 0.',
    'missing_metric was not measured.',
  ]);
});

test('report includes budget utilization and initial chunk composition', () => {
  const report = formatReport(measurements, { initial_javascript_bytes: 1000 });
  assert.match(report, /initial_javascript_bytes: 0\.8 KiB \/ 1\.0 KiB \(80\.0%\)/);
  assert.match(report, /assets\/app\.js: 0\.8 KiB \(0\.3 KiB gzip\)/);
});
