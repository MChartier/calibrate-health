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

export function parseCalibrationInput(value) {
  const parsed = requireRecord(value, 'History input');
  if (!Array.isArray(parsed.foodDays)) throw new Error('foodDays must be an array.');
  if (!Array.isArray(parsed.weightPoints)) throw new Error('weightPoints must be an array.');

  parsed.foodDays.forEach((value, index) => {
    const day = requireRecord(value, `foodDays[${index}]`);
    requireString(day.date, `foodDays[${index}].date`);
    requireFiniteNumber(day.calories, `foodDays[${index}].calories`);
    requireFiniteNumber(day.entryCount, `foodDays[${index}].entryCount`);
    requireFiniteNumber(day.mealPeriodCount, `foodDays[${index}].mealPeriodCount`);
    if (typeof day.isComplete !== 'boolean') {
      throw new Error(`foodDays[${index}].isComplete must be a boolean.`);
    }
  });
  parsed.weightPoints.forEach((value, index) => {
    const point = requireRecord(value, `weightPoints[${index}]`);
    requireString(point.date, `weightPoints[${index}].date`);
    requireFiniteNumber(point.trendWeightKg, `weightPoints[${index}].trendWeightKg`);
    const lower = requireFiniteNumber(point.lowerKg, `weightPoints[${index}].lowerKg`);
    const upper = requireFiniteNumber(point.upperKg, `weightPoints[${index}].upperKg`);
    if (lower > upper) throw new Error(`weightPoints[${index}] lowerKg cannot exceed upperKg.`);
  });

  if (parsed.activityDays !== undefined) {
    if (!Array.isArray(parsed.activityDays)) throw new Error('activityDays must be an array when provided.');
    parsed.activityDays.forEach((value, index) => {
      const day = requireRecord(value, `activityDays[${index}]`);
      requireString(day.date, `activityDays[${index}].date`);
      if (day.steps !== undefined && day.steps !== null) {
        requireFiniteNumber(day.steps, `activityDays[${index}].steps`);
      }
      if (day.activeCaloriesKcal !== undefined && day.activeCaloriesKcal !== null) {
        requireFiniteNumber(day.activeCaloriesKcal, `activityDays[${index}].activeCaloriesKcal`);
      }
    });
  }

  requireString(parsed.asOfDate, 'asOfDate');
  requireFiniteNumber(parsed.ageYears, 'ageYears');
  requireFiniteNumber(parsed.bmrKcal, 'bmrKcal');
  requireFiniteNumber(parsed.profileTdeeKcal, 'profileTdeeKcal');
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
