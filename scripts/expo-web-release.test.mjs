import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { enhanceExpoWebServiceWorker, inspectExpoWebExport } from './expo-web-release.mjs';

const SERVICE_WORKER_TEMPLATE = `
const CACHE_PREFIX = 'calibrate-expo-web-';
const CACHE_NAME = \`\${CACHE_PREFIX}shell-v1\`;
const APP_SHELL = ['/'];
function isBackendPath(pathname) { return /^\\/(?:api|auth)(?:\\/|$)/.test(pathname); }
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (isBackendPath(url.pathname)) return;
});
`;

function createFixture({ includeStaleBundle = false, missingEntry = false } = {}) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-expo-web-'));
  const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'web');
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'metadata.json'), JSON.stringify({ version: 0, bundler: 'metro' }));
  fs.writeFileSync(path.join(distDir, 'manifest.webmanifest'), JSON.stringify({
    name: 'calibrate',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    icons: [{ src: '/calibrate-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }));
  fs.writeFileSync(path.join(distDir, 'calibrate-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(distDir, 'sw.js'), SERVICE_WORKER_TEMPLATE);
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html><title>calibrate</title><div id="root"></div><script src="/_expo/static/js/web/index-a1b2c3.js" defer></script>',
  );
  if (!missingEntry) fs.writeFileSync(path.join(bundleDir, 'index-a1b2c3.js'), 'console.log("calibrate");');
  if (includeStaleBundle) fs.writeFileSync(path.join(bundleDir, 'index-deadbeef.js'), 'console.log("stale");');
  enhanceExpoWebServiceWorker(distDir);
  return distDir;
}

test('accepts a clean Expo web static artifact', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));

  assert.deepEqual(inspectExpoWebExport(distDir), {
    distDir,
    entryBundle: '_expo/static/js/web/index-a1b2c3.js',
    bundleCount: 1,
    assetCount: 1,
    precacheCount: 4,
    exportMode: 'single-page',
  });
});

test('accepts Metro deferred bundles referenced by the HTML entry bundle', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'web');
  fs.writeFileSync(
    path.join(bundleDir, 'index-a1b2c3.js'),
    '__d(function(){},1,{paths:{"2":"/_expo/static/js/web/index-feed1234.js"}});',
  );
  fs.writeFileSync(path.join(bundleDir, 'index-feed1234.js'), '__d(function(){},2,[]);');
  enhanceExpoWebServiceWorker(distDir);

  assert.equal(inspectExpoWebExport(distDir).bundleCount, 2);
});

test('rejects missing HTML-linked assets', (t) => {
  const distDir = createFixture({ missingEntry: true });
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));

  assert.throws(() => inspectExpoWebExport(distDir), /missing asset/);
});

test('does not mistake extensionless application links for static assets', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  const indexPath = path.join(distDir, 'index.html');
  fs.appendFileSync(indexPath, '<a href="/login">Sign in</a>');
  enhanceExpoWebServiceWorker(distDir);

  assert.equal(inspectExpoWebExport(distDir).assetCount, 1);
});

test('rejects an empty production document title', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  const indexPath = path.join(distDir, 'index.html');
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('<title>calibrate</title>', '<title></title>'));
  enhanceExpoWebServiceWorker(distDir);

  assert.throws(() => inspectExpoWebExport(distDir), /production document title/);
});

test('rejects stale hashed entry bundles left by an earlier export', (t) => {
  const distDir = createFixture({ includeStaleBundle: true });
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));

  assert.throws(() => inspectExpoWebExport(distDir), /stale or unreferenced entry bundles/);
});

test('service-worker enhancement is stable and changes when artifact content changes', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  const first = enhanceExpoWebServiceWorker(distDir);
  const second = enhanceExpoWebServiceWorker(distDir);
  assert.equal(second.cacheVersion, first.cacheVersion);

  fs.appendFileSync(path.join(distDir, '_expo', 'static', 'js', 'web', 'index-a1b2c3.js'), '\n// update');
  const changed = enhanceExpoWebServiceWorker(distDir);
  assert.notEqual(changed.cacheVersion, first.cacheVersion);
  assert.equal(inspectExpoWebExport(distDir).precacheCount, 4);
});

test('rejects a release artifact missing required PWA files', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.rmSync(path.join(distDir, 'manifest.webmanifest'));

  assert.throws(() => inspectExpoWebExport(distDir), /missing manifest\.webmanifest/);
});

test('rejects a service worker that can intercept backend traffic', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  const swPath = path.join(distDir, 'sw.js');
  fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('api|auth', 'assets'));

  assert.throws(() => inspectExpoWebExport(distDir), /explicitly bypass \/api and \/auth/);
});

test('accepts Expo Router static-route exports without legacy metadata', (t) => {
  const distDir = createFixture();
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.rmSync(path.join(distDir, 'metadata.json'));
  for (const route of ['login.html', 'register.html', 'settings.html']) {
    fs.writeFileSync(path.join(distDir, route), '<!doctype html><title>calibrate</title>');
  }
  enhanceExpoWebServiceWorker(distDir);

  assert.equal(inspectExpoWebExport(distDir).exportMode, 'static-routes');
});
