import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const APP_ID = 'app.calibratehealth.mobile';
const ACTIVITY = `${APP_ID}/app.calibratehealth.wear.MainActivity`;
const UI_DUMP_PATH = '/sdcard/calibrate-wear-smoke.xml';

export function parseBounds(value) {
  const match = value.match(/^\[(\d+),(\d+)]\[(\d+),(\d+)]$/);
  if (!match) throw new Error(`Invalid Android bounds: ${value}`);
  const [, left, top, right, bottom] = match.map(Number);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

export function findTextNode(xml, text) {
  const node = (xml.match(/<node\b[^>]*>/g) ?? [])
    .find((candidate) => attribute(candidate, 'text') === text);
  return node ? { text, bounds: attribute(node, 'bounds') } : null;
}

function adbExecutable(environment = process.env) {
  return environment.ADB
    ?? path.join(environment.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
}

function runAdb(adb, serial, args, options = {}) {
  return execFileSync(adb, ['-s', serial, ...args], {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit']
  }).trim();
}

function dumpUi(adb, serial) {
  runAdb(adb, serial, ['shell', 'uiautomator', 'dump', UI_DUMP_PATH], { quiet: true });
  return runAdb(adb, serial, ['exec-out', 'cat', UI_DUMP_PATH], { quiet: true });
}

function requireText(xml, text) {
  const node = findTextNode(xml, text);
  if (!node) throw new Error(`Wear UI did not expose expected text: ${text}`);
  return node;
}

/** Exercise a non-debuggable watch shell and privacy-sensitive package state on an adb Wear target. */
export function runWearEmulatorSmoke(environment = process.env) {
  const adb = adbExecutable(environment);
  const serial = environment.WEAR_ADB_SERIAL ?? 'emulator-5556';
  const expectedBuildType = environment.WEAR_BUILD_TYPE ?? 'release';
  const apk = path.resolve(
    repositoryRoot,
    environment.WEAR_APK ?? 'wear/app/build/outputs/apk/release/app-release.apk'
  );
  if (!fs.existsSync(apk)) {
    throw new Error(`Wear APK is missing: ${apk}. Build the release artifact first.`);
  }

  const characteristics = runAdb(adb, serial, ['shell', 'getprop', 'ro.build.characteristics'], { quiet: true });
  if (!characteristics.split(',').includes('watch')) {
    throw new Error(`${serial} is not a Wear OS target: ${characteristics}`);
  }

  runAdb(adb, serial, ['install', '-r', apk]);
  runAdb(adb, serial, ['logcat', '-c'], { quiet: true });
  runAdb(adb, serial, ['shell', 'am', 'force-stop', APP_ID], { quiet: true });
  const launch = runAdb(adb, serial, ['shell', 'am', 'start', '-W', '-n', ACTIVITY], { quiet: true });
  if (!launch.includes('Status: ok')) throw new Error(`Wear activity failed to launch:\n${launch}`);

  const home = dumpUi(adb, serial);
  requireText(home, 'Today');
  requireText(home, "Pair with Calibrate on your phone to see today's summary.");
  const connection = requireText(home, 'Connection');
  requireText(home, 'Phone setup required');
  const point = parseBounds(connection.bounds);
  runAdb(adb, serial, ['shell', 'input', 'tap', String(point.x), String(point.y)], { quiet: true });
  runAdb(adb, serial, ['shell', 'sleep', '1'], { quiet: true });

  const detail = dumpUi(adb, serial);
  requireText(detail, 'Connection');
  requireText(detail, `${expectedBuildType} build`);
  requireText(detail, 'Open Calibrate settings on your phone and choose the nearby watch to begin.');

  const packageState = runAdb(adb, serial, ['shell', 'dumpsys', 'package', APP_ID], { quiet: true });
  if (packageState.includes('DEBUGGABLE')) throw new Error('Installed Wear release package is debuggable.');
  if (!packageState.includes('app.calibratehealth.wear.tile.CalibrateTileService')) {
    throw new Error('Wear Tile provider is missing from the installed package.');
  }
  if (!/android\.permission\.POST_NOTIFICATIONS: granted=false/.test(packageState)) {
    throw new Error('Wear requested notification permission before an explicit user action.');
  }
  for (const forbidden of [
    'android.permission.BODY_SENSORS',
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO'
  ]) {
    if (packageState.includes(forbidden)) throw new Error(`Unexpected Wear permission: ${forbidden}`);
  }

  const crashes = runAdb(adb, serial, ['logcat', '-b', 'crash', '-d', '-v', 'brief'], { quiet: true });
  if (/FATAL EXCEPTION|AndroidRuntime|ANR in/i.test(crashes)) {
    throw new Error(`Wear crash buffer is not empty:\n${crashes}`);
  }
  const totalTime = launch.match(/TotalTime:\s*(\d+)/)?.[1] ?? 'unknown';
  console.log(`PASS Wear ${expectedBuildType} smoke on ${serial}: cold start ${totalTime} ms, unpaired/connection UI, Tile, permissions, and crash buffer.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runWearEmulatorSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
