import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const CAPTURE_ENABLED = process.env.CALIBRATE_CAPTURE_SCREENSHOTS === '1';
const LAB_URL = process.env.CALIBRATE_CALIBRATION_LAB_URL?.trim() || 'http://127.0.0.1:5173';
const OUTPUT_DIRECTORY = path.resolve('docs/screenshots/calibration-signals');
const VIEWPORT = { width: 1440, height: 1100 };

if (!CAPTURE_ENABLED) {
  throw new Error(
    'Set CALIBRATE_CAPTURE_SCREENSHOTS=1 to replace the reviewed Calibration lab evidence.',
  );
}

const scenarioResponse = await fetch(new URL('/api/scenarios', LAB_URL));
if (!scenarioResponse.ok) {
  throw new Error('Calibration lab returned ' + scenarioResponse.status + ' for /api/scenarios.');
}

const scenarios = await scenarioResponse.json();
if (!Array.isArray(scenarios) || scenarios.length === 0) {
  throw new Error('Calibration lab returned no screenshot scenarios.');
}

await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    viewport: VIEWPORT,
  });
  const page = await context.newPage();

  for (const [index, scenario] of scenarios.entries()) {
    if (!scenario || typeof scenario.id !== 'string' || typeof scenario.name !== 'string') {
      throw new Error('Scenario ' + (index + 1) + ' is missing a stable id or name.');
    }

    const scenarioUrl = new URL('/', LAB_URL);
    scenarioUrl.searchParams.set('scenario', scenario.id);
    await page.goto(scenarioUrl.href, { waitUntil: 'networkidle' });
    await page.locator('.preview-state', { hasText: 'Live preview' }).waitFor();
    await page.getByText('Calibration', { exact: true }).waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.addStyleTag({
      content: [
        '.workspace { display: none !important; }',
        'main { padding-bottom: 28px !important; }',
        '* { caret-color: transparent !important; }',
      ].join('\n'),
    });

    const sequence = String(index + 1).padStart(2, '0');
    const filename = sequence + '-' + scenario.id + '.png';
    await page.locator('main').screenshot({
      animations: 'disabled',
      path: path.join(OUTPUT_DIRECTORY, filename),
    });
    process.stdout.write('Captured ' + filename + ': ' + scenario.name + '\n');
  }

  await context.close();
} finally {
  await browser.close();
}

process.stdout.write(
  'Captured ' + scenarios.length + ' Calibration scenarios in ' + OUTPUT_DIRECTORY + '.\n',
);
