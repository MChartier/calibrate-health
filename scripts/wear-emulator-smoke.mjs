import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const APP_ID = 'app.calibratehealth.mobile';
const ACTIVITY = `${APP_ID}/app.calibratehealth.wear.MainActivity`;
const UI_DUMP_PATH = '/sdcard/calibrate-wear-smoke.xml';
const WEAR_UI_READY_ATTEMPTS = 15;
const WEAR_UI_POLL_SECONDS = '1';
const HOME_EXPECTED_TEXT = Object.freeze([
  'calibrate',
  "Pair with Calibrate on your phone to see today's summary.",
  'Connection',
  'Phone setup required'
]);

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
export function listWearUiPackages(xml) {
  return [...new Set(
    (xml.match(/<node\b[^>]*>/g) ?? [])
      .map((node) => attribute(node, 'package'))
      .filter((packageName) => /^[a-zA-Z0-9._-]+$/.test(packageName))
  )].sort();
}

/** Reassert the reviewed activity when Wear System UI takes foreground during first-boot settling. */
export function createRecoveringWearUiReader(expectedPackage, readUi, relaunch) {
  if (typeof expectedPackage !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(expectedPackage)) {
    throw new Error('Wear UI recovery requires an exact package name.');
  }
  return () => {
    const xml = readUi();
    if (!listWearUiPackages(xml).includes(expectedPackage)) relaunch();
    return xml;
  };
}

/** Wait for one complete reviewed surface; transient splash/partial trees never count as evidence. */
export function waitForWearUi(expectedText, readUi, waitBetweenAttempts, maxAttempts = WEAR_UI_READY_ATTEMPTS) {
  if (!Array.isArray(expectedText) || expectedText.length === 0
      || expectedText.some((text) => typeof text !== 'string' || !text)) {
    throw new Error('Wear UI readiness requires exact non-empty text selectors.');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Wear UI readiness attempts must be a positive integer.');
  }
  let missing = [...expectedText];
  let lastXml = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastXml = readUi();
    missing = expectedText.filter((text) => !findTextNode(lastXml, text));
    if (missing.length === 0) return lastXml;
    if (attempt < maxAttempts) waitBetweenAttempts();
  }
  const packages = listWearUiPackages(lastXml);
  throw new Error(
    `Wear UI did not become ready with expected text: ${missing.join(' | ')}; visible packages: ${packages.join(', ') || 'none'}`
  );
}

/** Verify one scrollable Wear surface without requiring off-screen rows in one UI dump. */
export function waitForScrollableWearUi(expectedText, readUi, scrollForward, maxAttempts = WEAR_UI_READY_ATTEMPTS) {
  if (!Array.isArray(expectedText) || expectedText.length === 0
      || expectedText.some((text) => typeof text !== 'string' || !text)) {
    throw new Error('Scrollable Wear UI readiness requires exact non-empty text selectors.');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Scrollable Wear UI readiness attempts must be a positive integer.');
  }
  const missing = new Set(expectedText);
  let xml = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    xml = readUi();
    for (const text of missing) {
      if (findTextNode(xml, text)) missing.delete(text);
    }
    if (missing.size === 0) return xml;
    if (attempt < maxAttempts) scrollForward();
  }
  throw new Error(`Scrollable Wear UI did not expose expected text: ${[...missing].join(' | ')}`);
}
export function resolveWearAdb(environment = process.env, platform = process.platform) {
  if (environment.ADB?.trim()) return environment.ADB.trim();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const sdkRoot = environment.ANDROID_HOME
    ?? environment.ANDROID_SDK_ROOT
    ?? (environment.LOCALAPPDATA ? pathApi.join(environment.LOCALAPPDATA, 'Android', 'Sdk') : null);
  if (!sdkRoot) return platform === 'win32' ? 'adb.exe' : 'adb';
  return pathApi.join(sdkRoot, 'platform-tools', platform === 'win32' ? 'adb.exe' : 'adb');
}

export function prepareWearUi(run) {
  for (const args of [
    ['shell', 'settings', 'put', 'global', 'device_provisioned', '1'],
    ['shell', 'settings', 'put', 'secure', 'user_setup_complete', '1']
  ]) run(args);
  for (const [namespace, key] of [
    ['global', 'device_provisioned'],
    ['secure', 'user_setup_complete']
  ]) {
    const value = String(run(['shell', 'settings', 'get', namespace, key])).trim();
    if (value !== '1') {
      throw new Error(`Wear emulator setup did not persist ${namespace} ${key}=1.`);
    }
  }
  for (const args of [
    ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'],
    ['shell', 'wm', 'dismiss-keyguard'],
    ['shell', 'input', 'keyevent', '82']
  ]) run(args);
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
  const adb = resolveWearAdb(environment);
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
  prepareWearUi((args) => runAdb(adb, serial, args, { quiet: true }));
  runAdb(adb, serial, ['logcat', '-c'], { quiet: true });
  const launchWear = () => {
    runAdb(adb, serial, ['shell', 'am', 'force-stop', APP_ID], { quiet: true });
    const output = runAdb(adb, serial, ['shell', 'am', 'start', '-W', '-n', ACTIVITY], { quiet: true });
    if (!output.includes('Status: ok')) throw new Error(`Wear activity failed to launch:\n${output}`);
    return output;
  };
  let launch = launchWear();
  const readHomeUi = createRecoveringWearUiReader(
    APP_ID,
    () => dumpUi(adb, serial),
    () => { launch = launchWear(); }
  );

  const waitForExpectedUi = (expectedText) => waitForWearUi(
    expectedText,
    readHomeUi,
    () => runAdb(adb, serial, ['shell', 'sleep', WEAR_UI_POLL_SECONDS], { quiet: true })
  );
  const home = waitForExpectedUi(HOME_EXPECTED_TEXT);
  const connection = requireText(home, 'Connection');
  const point = parseBounds(connection.bounds);
  runAdb(adb, serial, ['shell', 'input', 'tap', String(point.x), String(point.y)], { quiet: true });

  waitForScrollableWearUi([
    'Connection',
    `${expectedBuildType} build`,
    'Open Calibrate settings on your phone and choose the nearby watch to begin.'
  ], () => dumpUi(adb, serial), () => {
    runAdb(adb, serial, ['shell', 'input', 'swipe', '160', '500', '160', '140', '300'], { quiet: true });
    runAdb(adb, serial, ['shell', 'sleep', WEAR_UI_POLL_SECONDS], { quiet: true });
  });

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
