import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = process.env.CALIBRATE_E2E_API_URL ?? 'http://127.0.0.1:3000';
const TEST_EMAIL = process.env.CALIBRATE_E2E_EMAIL ?? 'test@calibratehealth.app';
const TEST_PASSWORD = process.env.CALIBRATE_E2E_PASSWORD ?? 'password123';
const APP_ID = 'app.calibratehealth.mobile';
const ONLINE_FOOD = { name: 'Android E2E latte', calories: 190 };
const OFFLINE_FOOD = { name: 'Android E2E protein shake', calories: 240 };
const UI_DUMP_PATH = '/sdcard/calibrate-e2e-window.xml';
const METRO_REVERSE_HOST = 'localhost:8081';
const API_REVERSE_PORT = 'tcp:3000';
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'content-encoding', 'content-length', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'
]);
const ADB = process.env.ADB
  ?? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const release = JSON.parse(readFileSync(new URL('../shared/release.json', import.meta.url), 'utf8'));
const NATIVE_CLIENT_HEADERS = {
  PLATFORM: 'x-calibrate-client-platform',
  VERSION: 'x-calibrate-client-version'
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function adb(args, options = {}) {
  return execFileSync(ADB, args, {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit']
  }).trim();
}

/** Proxy the app's reversed loopback API separately from the host-side assertions. */
async function startApiProxy() {
  const target = new URL(API_URL);
  let available = true;
  let closed = false;
  const server = http.createServer(async (request, response) => {
    if (!available) {
      request.resume();
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end('{"message":"Android E2E API proxy is offline."}');
      return;
    }

    try {
      const bodyChunks = [];
      for await (const chunk of request) bodyChunks.push(chunk);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined && name !== 'host' && !HOP_BY_HOP_HEADERS.has(name)) {
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
      }
      const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;
      const upstream = await fetch(new URL(request.url ?? '/', target), {
        method: request.method,
        headers,
        body
      });
      const responseHeaders = {};
      upstream.headers.forEach((value, name) => {
        if (!HOP_BY_HOP_HEADERS.has(name)) responseHeaders[name] = value;
      });
      response.writeHead(upstream.status, responseHeaders);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      if (closed) {
        response.destroy();
        return;
      }
      console.error(`Android E2E API proxy failed ${request.method} ${request.url}: ${error.message}`);
      if (!response.headersSent) response.writeHead(502);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to start the Android E2E API proxy.');

  return {
    port: address.port,
    setAvailable: (nextAvailable) => {
      available = nextAvailable;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function reverseApiTo(proxy) {
  adb(['reverse', API_REVERSE_PORT, `tcp:${proxy.port}`], { quiet: true });
}

function removeApiReverse() {
  try {
    adb(['reverse', '--remove', API_REVERSE_PORT], { quiet: true });
  } catch {
    // A failed run may already have removed the isolated API mapping.
  }
}

async function waitFor(label, check, timeoutMs = 30_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function readAttribute(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

function parseBounds(value) {
  const match = value.match(/^\[(\d+),(\d+)]\[(\d+),(\d+)]$/);
  if (!match) throw new Error(`Invalid Android bounds: ${value}`);
  const [, left, top, right, bottom] = match.map(Number);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

function dumpUi() {
  adb(['shell', 'uiautomator', 'dump', UI_DUMP_PATH], { quiet: true });
  return adb(['exec-out', 'cat', UI_DUMP_PATH], { quiet: true });
}

/** Keep Metro on adb reverse while the API proxy is isolated independently. */
function configureMetroReverseHost() {
  const preferencesFile = `shared_prefs/${APP_ID}_preferences.xml`;
  const preferences = `<map><string name="debug_http_host">${METRO_REVERSE_HOST}</string></map>`;
  const encodedPreferences = Buffer.from(preferences, 'utf8').toString('base64');
  const writePreferences =
    `mkdir -p shared_prefs && echo ${encodedPreferences} | base64 -d > ${preferencesFile}`;
  adb(['reverse', 'tcp:8081', 'tcp:8081'], { quiet: true });
  adb(['shell', `run-as ${APP_ID} sh -c '${writePreferences}'`], { quiet: true });
}

function findNode(xml, predicate) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  for (const node of nodes) {
    const candidate = {
      text: readAttribute(node, 'text'),
      label: readAttribute(node, 'content-desc'),
      bounds: readAttribute(node, 'bounds'),
      clickable: readAttribute(node, 'clickable') === 'true'
    };
    if (predicate(candidate)) return candidate;
  }
  return null;
}

async function waitForNode(label, predicate, timeoutMs = 30_000) {
  return waitFor(label, async () => findNode(dumpUi(), predicate), timeoutMs, 750);
}

async function tapNode(label, predicate, timeoutMs = 30_000) {
  const node = await waitForNode(label, predicate, timeoutMs);
  const point = parseBounds(node.bounds);
  adb(['shell', 'input', 'tap', String(point.x), String(point.y)], { quiet: true });
}

/** Attach the release-candidate phone identity to direct API assertions made outside the app. */
export function buildE2eRequestHeaders(initialHeaders = {}) {
  const headers = new Headers(initialHeaders);
  headers.set(NATIVE_CLIENT_HEADERS.PLATFORM, 'android_phone');
  headers.set(NATIVE_CLIENT_HEADERS.VERSION, release.android.mobile.version_name);
  return headers;
}

/** Ignore shell/test-runner crashes while still failing on the Calibrate application process. */
export function crashBufferContainsCalibrateProcess(crashBuffer) {
  return /Process:\s+app\.calibratehealth\.mobile(?:[:,\s]|$)/i.test(crashBuffer);
}

async function requestJson(pathname, options = {}) {
  const method = options.method ?? 'GET';
  const attempts = method === 'GET' ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${pathname}`, {
        ...options,
        headers: buildE2eRequestHeaders(options.headers)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`${method} ${pathname} returned ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      // The local dev server may retire an idle keep-alive socket while the emulator boots.
      if (attempt < attempts) await sleep(250 * attempt);
    }
  }
  throw lastError;
}

async function loginApi() {
  return requestJson('/auth/mobile/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      device_id: 'android-e2e-probe',
      device_platform: 'android_phone',
      device_name: 'Android E2E probe'
    })
  });
}

function localDateFor(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function countFood(accessToken, date, name) {
  const logs = await requestJson(`/api/v1/food?date=${encodeURIComponent(date)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  return logs.filter((entry) => entry.name === name).length;
}

/** Put known rows at the front of Quick recents without relying on mutable seed history. */
async function seedRecentFood(accessToken, date, food) {
  await requestJson('/api/v1/food', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      meal_period: 'DINNER',
      name: food.name,
      calories: food.calories,
      date
    })
  });
}

async function waitForFoodCount(accessToken, date, name, expected, timeoutMs = 30_000) {
  return waitFor(`${name} count ${expected}`, async () => {
    const count = await countFood(accessToken, date, name);
    return count === expected ? count : null;
  }, timeoutMs, 750);
}

async function launchAndWaitForLog() {
  adb(['shell', 'am', 'force-stop', APP_ID], { quiet: true });
  adb(['shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1'], { quiet: true });
  await waitForNode('authenticated Log screen', (node) => node.clickable && node.label === 'Add food', 45_000);
}

async function openQuickAdd() {
  await tapNode('Add food button', (node) => node.clickable && node.label === 'Add food');
  await tapNode('Quick add mode', (node) => node.clickable && node.label === 'Quick');
}

async function logOpenRecentFood(name) {
  await tapNode(`${name} recent row`, (node) => node.clickable && node.label.startsWith(`${name},`));
  await waitForNode('Add food sheet to close', (node) => node.clickable && node.label === 'Add food', 45_000);
}

async function logRecentFood(name) {
  await openQuickAdd();
  await logOpenRecentFood(name);
}

async function main() {
  let apiProxy = null;
  const health = await requestJson('/api/v1/healthz');
  if (!health.ok) throw new Error('Calibrate E2E backend health check failed.');
  const metroStatus = await fetch('http://127.0.0.1:8081/status').then((response) => response.text());
  if (!metroStatus.includes('packager-status:running')) {
    throw new Error('Metro is not running on port 8081. Start the mobile dev server first.');
  }

  const session = await loginApi();
  const date = localDateFor(session.user.timezone);
  await seedRecentFood(session.access_token, date, ONLINE_FOOD);
  await seedRecentFood(session.access_token, date, OFFLINE_FOOD);
  apiProxy = await startApiProxy();
  adb(['wait-for-device'], { quiet: true });
  adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'], { quiet: true });
  reverseApiTo(apiProxy);
  // Scope the crash assertion to this run so stale emulator crashes do not cause a false failure.
  adb(['logcat', '-c'], { quiet: true });
  adb(['shell', 'pm', 'clear', APP_ID], { quiet: true });
  configureMetroReverseHost();

  try {
    await launchAndWaitForLog();

    const onlineName = ONLINE_FOOD.name;
    const onlineBefore = await countFood(session.access_token, date, onlineName);
    await logRecentFood(onlineName);
    await waitForFoodCount(session.access_token, date, onlineName, onlineBefore + 1);
    console.log(`PASS online one-tap logging: ${onlineName} ${onlineBefore} -> ${onlineBefore + 1}`);

    const offlineName = OFFLINE_FOOD.name;
    const offlineBefore = await countFood(session.access_token, date, offlineName);
    // Load the cached Quick list before isolating the API while Metro remains reachable through adb reverse.
    await openQuickAdd();
    apiProxy.setAvailable(false);
    await logOpenRecentFood(offlineName);
    const pendingBadge = await waitForNode(
      'offline pending badge',
      (node) => node.clickable && node.label.includes('offline changes pending'),
      25_000
    );
    if (!pendingBadge) throw new Error('Queued write was not exposed in the account accessibility label.');
    if (await countFood(session.access_token, date, offlineName) !== offlineBefore) {
      throw new Error('Offline write reached the server before reconnect.');
    }

    adb(['shell', 'am', 'force-stop', APP_ID], { quiet: true });
    apiProxy.setAvailable(true);
    await launchAndWaitForLog();
    await waitForFoodCount(session.access_token, date, offlineName, offlineBefore + 1, 45_000);
    console.log(`PASS process-death replay: ${offlineName} ${offlineBefore} -> ${offlineBefore + 1}`);

    await launchAndWaitForLog();
    await sleep(3_000);
    const finalCount = await countFood(session.access_token, date, offlineName);
    if (finalCount !== offlineBefore + 1) {
      throw new Error(`Replay duplicated ${offlineName}: expected ${offlineBefore + 1}, received ${finalCount}`);
    }
    const finalPid = adb(['shell', 'pidof', '-s', APP_ID], { quiet: true });
    if (!finalPid) throw new Error('Calibrate process is not alive after the final replay check.');
    const crashes = adb(['logcat', '-b', 'crash', '-d', '-v', 'brief'], { quiet: true });
    if (crashBufferContainsCalibrateProcess(crashes)) {
      throw new Error(`Calibrate appears in the Android crash buffer:\n${crashes}`);
    }
    console.log(`PASS exactly-once replay after second restart: ${offlineName} remained ${finalCount}`);
  } finally {
    adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'], { quiet: true });
    await apiProxy?.close().catch(() => undefined);
    removeApiReverse();
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
