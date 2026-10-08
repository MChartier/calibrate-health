import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { hash, byteHash, SHA } from './release-plan.mjs';

export function relevantPlatformFile(file, platform, files) {
  if (/(^|\/)(__tests__|__mocks__|test|tests)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\.(md|snap)$/.test(file)) return false;
  const match = /^(.*?)(?:\.(android|ios|native|web))?(\.[cm]?[jt]sx?)$/.exec(file);
  if (!match) return true;
  const [, base, suffix, extension] = match;
  const order = platform === 'web' ? ['web', ''] : [platform, 'native', ''];
  const preferred = order.map(s => `${base}${s ? `.${s}` : ''}${extension}`).find(p => files.has(p));
  return preferred === file;
}

/** Resolve nested npm/workspace graphs; unrelated root tooling versions do not advance baselines. */
export function dependencyClosure(lock, workspace) {
  assert(lock.packages?.[workspace], 'Lockfile is missing the selected workspace.');
  const selected = {}, pending = [workspace];
  while (pending.length) {
    const key = pending.pop(); if (selected[key]) continue;
    const entry = lock.packages[key]; assert(entry, 'Incomplete dependency lock.');
    const normalized = structuredClone(entry);
    if (key === workspace || !key.includes('node_modules/')) delete normalized.version;
    selected[key] = normalized;
    if (entry.link) { assert(lock.packages[entry.resolved], 'Missing workspace link.'); pending.push(entry.resolved); }
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })) {
      let scope = key, found;
      while (scope) {
        const candidate = `${scope}/node_modules/${name}`;
        if (lock.packages[candidate]) { found = candidate; break; }
        const marker = scope.lastIndexOf('/node_modules/');
        scope = marker < 0 ? '' : scope.slice(0, marker);
      }
      found ??= lock.packages[`node_modules/${name}`] ? `node_modules/${name}` : undefined;
      // npm omits optional peer dependencies on some hosts, but direct dependencies must resolve.
      assert(found || !entry.dependencies?.[name], 'Unresolved direct dependency in lockfile.');
      if (found) pending.push(found);
    }
  }
  return selected;
}

function normalize(file, buffer, platform) {
  const text = buffer.toString('utf8');
  if (file.endsWith('package.json')) {
    const json = JSON.parse(text); delete json.version; return json;
  }
  if (file === 'shared/release.json') {
    const json = JSON.parse(text);
    delete json.server.version;
    for (const p of ['mobile', 'wear']) { delete json.android[p].version_name; delete json.android[p].version_code; delete json.android[p].native_release_tag; }
    if (json.ios) { delete json.ios.version; delete json.ios.buildNumber; }
    return json;
  }
  if (file === 'shared/ios-release.json') {
    const json = JSON.parse(text); delete json.version; delete json.buildNumber; return json;
  }
  if (file === 'mobile/app.json') {
    const json = JSON.parse(text), config = json.expo;
    delete config.version;
    if (config.android) delete config.android.versionCode;
    if (config.ios) delete config.ios.buildNumber;
    if (config.extra?.calibrate) delete config.extra.calibrate.nativeReleaseTag;
    if (platform !== 'web') delete config.web;
    if (platform === 'web') { delete config.android; delete config.ios; }
    if (platform === 'ios') delete config.android;
    if (platform === 'android') delete config.ios;
    return json;
  }
  if (/^(wear|mobile\/modules)\/.+build\.gradle(?:\.kts)?$/.test(file)) {
    return text.replace(/(versionCode\s*=?\s*)\d+/g, '$1<allocated>')
      .replace(/(versionName\s*=?\s*)["'][^"']+["']/g, '$1"<allocated>"')
      .replace(/^version\s*=.*$/gm, 'version = "<allocated>"');
  }
  return byteHash(buffer);
}

/** Hash exact Git objects, never CRLF worktree variants. Package metadata must match installed locked dependencies. */
export function releaseInputs(root, source, { execute = execFileSync, nativePackages } = {}) {
  assert(SHA.test(source), 'Input snapshot requires a full source SHA.');
  const git = args => execute('git', ['--no-replace-objects', '-c', 'core.quotepath=false', ...args],
    { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const files = new Set(git(['ls-tree', '-rz', '--name-only', source]).toString('utf8').split('\0').filter(Boolean));
  const read = file => git(['show', `${source}:${file}`]);
  const lock = JSON.parse(read('package-lock.json'));
  const mobileDependencies = dependencyClosure(lock, 'mobile');
  const backendDependencies = dependencyClosure(JSON.parse(read('backend/package-lock.json')), '');
  if (!nativePackages) {
    nativePackages = { android: new Set(), ios: new Set() };
    for (const [key, entry] of Object.entries(mobileDependencies)) {
      if (!key.includes('node_modules/') || entry.link) continue;
      const directory = path.join(root, key), metadata = path.join(directory, 'package.json');
      assert(fs.existsSync(metadata), 'Install the exact locked workspace dependencies before native fingerprinting.');
      assert.equal(JSON.parse(fs.readFileSync(metadata)).version, entry.version, 'Installed package differs from lockfile.');
      for (const platform of ['android', 'ios']) {
        const modulePath = path.join(directory, 'expo-module.config.json');
        const module = fs.existsSync(modulePath) ? JSON.parse(fs.readFileSync(modulePath)) : {};
        if (fs.existsSync(path.join(directory, platform)) || module.platforms?.includes(platform === 'ios' ? 'apple' : platform) ||
          module[platform] || fs.existsSync(path.join(directory, 'app.plugin.js')) ||
          fs.existsSync(path.join(directory, 'react-native.config.js')) ||
          /node_modules\/(expo|react-native|@expo\/(config|config-plugins|prebuild-config))$/.test(key)) nativePackages[platform].add(key);
      }
    }
  }
  function snapshot(platform, native) {
    const values = [];
    for (const file of [...files].sort()) {
      if (!relevantPlatformFile(file, platform, files) || file.endsWith('package-lock.json') || file === 'shared/client-diagnostic-versions.json') continue;
      const client = /^(mobile|shared|packages)\//.test(file);
      const nativeFile = /^(mobile\/(app\.(json|config\.js)|eas\.json|plugins\/|modules\/|assets\/.*(?:icon|splash))|wear\/)/.test(file);
      const tool = /^scripts\/(native-|wear-|release-|expo-|build-)/.test(file) && !file.endsWith('.test.mjs');
      let include = platform === 'web' ? client || /^(backend|deploy)\//.test(file) || /^(Dockerfile|\.dockerignore|package\.json)/.test(file) || tool
        : native ? nativeFile || tool : client;
      // Native implementation files are not inputs to the web bundle in the server image.
      if (platform === 'web' && (file.startsWith('mobile/plugins/') || /^mobile\/modules\/[^/]+\/(android|ios)\//.test(file))) include = false;
      if (platform === 'ios' && (file.startsWith('wear/') || /\/android\//.test(file))) include = false;
      if (platform === 'android' && /\/ios\//.test(file)) include = false;
      if (include) values.push([file, normalize(file, read(file), platform)]);
    }
    const dependencies = native ? Object.fromEntries(Object.entries(mobileDependencies).filter(([key]) => nativePackages[platform].has(key))) : mobileDependencies;
    return hash({ files: values, dependencies, ...(platform === 'web' ? { backendDependencies } : {}) });
  }
  return { server: snapshot('web', false), native: { android: snapshot('android', true), ios: snapshot('ios', true) },
    bundle: { android: snapshot('android', false), ios: snapshot('ios', false) } };
}
