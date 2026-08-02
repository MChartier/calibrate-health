import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const assetDirectory = resolve(repositoryRoot, 'tools', 'calibration-lab');
const responseAssets = new Map([
  ['/', { path: resolve(assetDirectory, 'index.html'), contentType: 'text/html; charset=utf-8' }],
  ['/main.js', { path: resolve(assetDirectory, 'main.js'), contentType: 'text/javascript; charset=utf-8' }],
  ['/presentation.mjs', { path: resolve(assetDirectory, 'presentation.mjs'), contentType: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { path: resolve(assetDirectory, 'styles.css'), contentType: 'text/css; charset=utf-8' }]
]);

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function requireNonNegativeNumber(value, label) {
  const parsed = requireFiniteNumber(value, label);
  if (parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

function requireNonNegativeInteger(value, label) {
  const parsed = requireNonNegativeNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
}

function requireDateOnly(value, label) {
  const parsed = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || new Date(`${parsed}T00:00:00.000Z`).toISOString().slice(0, 10) !== parsed) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return parsed;
}

function requireUniqueDates(values, label) {
  const seen = new Set();
  values.forEach((value, index) => {
    const date = value.date;
    if (seen.has(date)) throw new Error(`${label}[${index}].date duplicates ${date}.`);
    seen.add(date);
  });
}

export function parseCalibrationInput(value) {
  const parsed = requireRecord(value, 'History input');
  if (!Array.isArray(parsed.foodDays)) throw new Error('foodDays must be an array.');
  if (!Array.isArray(parsed.weightPoints)) throw new Error('weightPoints must be an array.');

  parsed.foodDays.forEach((value, index) => {
    const day = requireRecord(value, `foodDays[${index}]`);
    requireDateOnly(day.date, `foodDays[${index}].date`);
    requireNonNegativeNumber(day.calories, `foodDays[${index}].calories`);
    requireNonNegativeInteger(day.entryCount, `foodDays[${index}].entryCount`);
    requireNonNegativeInteger(day.mealPeriodCount, `foodDays[${index}].mealPeriodCount`);
    if (typeof day.isComplete !== 'boolean') {
      throw new Error(`foodDays[${index}].isComplete must be a boolean.`);
    }
  });
  requireUniqueDates(parsed.foodDays, 'foodDays');
  parsed.weightPoints.forEach((value, index) => {
    const point = requireRecord(value, `weightPoints[${index}]`);
    requireDateOnly(point.date, `weightPoints[${index}].date`);
    const trend = requireNonNegativeNumber(point.trendWeightKg, `weightPoints[${index}].trendWeightKg`);
    const lower = requireNonNegativeNumber(point.lowerKg, `weightPoints[${index}].lowerKg`);
    const upper = requireNonNegativeNumber(point.upperKg, `weightPoints[${index}].upperKg`);
    if (lower > upper) throw new Error(`weightPoints[${index}] lowerKg cannot exceed upperKg.`);
    if (trend < lower || trend > upper) {
      throw new Error(`weightPoints[${index}].trendWeightKg must fall between lowerKg and upperKg.`);
    }
  });
  requireUniqueDates(parsed.weightPoints, 'weightPoints');

  if (parsed.activityDays !== undefined) {
    if (!Array.isArray(parsed.activityDays)) throw new Error('activityDays must be an array when provided.');
    parsed.activityDays.forEach((value, index) => {
      const day = requireRecord(value, `activityDays[${index}]`);
      requireDateOnly(day.date, `activityDays[${index}].date`);
      if (day.steps !== undefined && day.steps !== null) {
        requireNonNegativeNumber(day.steps, `activityDays[${index}].steps`);
      }
      if (day.activeCaloriesKcal !== undefined && day.activeCaloriesKcal !== null) {
        requireNonNegativeNumber(day.activeCaloriesKcal, `activityDays[${index}].activeCaloriesKcal`);
      }
    });
    requireUniqueDates(parsed.activityDays, 'activityDays');
  }

  requireDateOnly(parsed.asOfDate, 'asOfDate');
  if (parsed.weightUnit !== 'KG' && parsed.weightUnit !== 'LB') {
    throw new Error('weightUnit must be KG or LB.');
  }
  const ageYears = requireNonNegativeNumber(parsed.ageYears, 'ageYears');
  if (ageYears > 120) throw new Error('ageYears must be 120 or less.');
  const bmrKcal = requireNonNegativeNumber(parsed.bmrKcal, 'bmrKcal');
  const profileTdeeKcal = requireNonNegativeNumber(parsed.profileTdeeKcal, 'profileTdeeKcal');
  if (bmrKcal === 0 || profileTdeeKcal === 0) throw new Error('bmrKcal and profileTdeeKcal must be greater than zero.');
  if (profileTdeeKcal < bmrKcal) throw new Error('profileTdeeKcal cannot be lower than bmrKcal.');
  requireFiniteNumber(parsed.configuredDailyDeficitKcal, 'configuredDailyDeficitKcal');
  requireFiniteNumber(parsed.currentTargetAdjustmentKcal, 'currentTargetAdjustmentKcal');
  return parsed;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('History input exceeds the 1 MB limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

export function createCalibrationLabServer({ evaluateCalibration, scenarios }) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/scenarios') {
        sendJson(response, 200, scenarios);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/evaluate') {
        const input = parseCalibrationInput(await readJsonBody(request));
        sendJson(response, 200, evaluateCalibration(input));
        return;
      }
      const asset = request.method === 'GET' ? responseAssets.get(url.pathname) : undefined;
      if (asset) {
        response.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'no-store' });
        response.end(await readFile(asset.path));
        return;
      }
      sendJson(response, 404, { message: 'Not found' });
    } catch (error) {
      sendJson(response, 400, {
        message: error instanceof Error ? error.message : 'Invalid calibration history.'
      });
    }
  });
}

async function start() {
  const require = createRequire(import.meta.url);
  const { evaluateCalibration } = require(resolve(repositoryRoot, 'shared', 'dist', 'cjs', 'calibration.js'));
  const { CALIBRATION_SCENARIOS } = require(resolve(repositoryRoot, 'shared', 'dist', 'cjs', 'calibrationScenarios.js'));
  const port = Number.parseInt(process.env.CALIBRATION_LAB_PORT ?? '5173', 10);
  const server = createCalibrationLabServer({ evaluateCalibration, scenarios: CALIBRATION_SCENARIOS });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Calibration history lab: http://127.0.0.1:${port}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await start();
}
