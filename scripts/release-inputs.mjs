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
export function dependencyClosure(lock, workspace, { buildTools = [] } = {}) {
  assert(lock.packages?.[workspace], 'Lockfile is missing the selected workspace.');
  const selected = {}, pending = [workspace];
  while (pending.length) {
    const key = pending.pop(); if (selected[key]) continue;
    const entry = lock.packages[key]; assert(entry, 'Incomplete dependency lock.');
    const normalized = structuredClone(entry);
    if (key === workspace || !key.includes('node_modules/')) delete normalized.version;
    selected[key] = normalized;
    if (entry.link) { assert(lock.packages[entry.resolved], 'Missing workspace link.'); pending.push(entry.resolved); }
    const development = !key.includes('node_modules/') ? Object.fromEntries(Object.entries(entry.devDependencies ?? {})
      .filter(([name]) => buildTools.includes(name))) : {};
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies, ...development })) {
      let scope = key, found;
      while (scope) {
        const candidate = `${scope}/node_modules/${name}`;
        if (lock.packages[candidate]) { found = candidate; break; }
        const marker = scope.lastIndexOf('/node_modules/');
        scope = marker < 0 ? '' : scope.slice(0, marker);
      }
      found ??= lock.packages[`node_modules/${name}`] ? `node_modules/${name}` : undefined;
      // npm omits optional peer dependencies on some hosts, but direct dependencies must resolve.
      assert(found || !(entry.dependencies?.[name] || development[name]), 'Unresolved direct dependency in lockfile.');
      if (found) pending.push(found);
    }
  }
  return selected;
}

function normalize(file, buffer, platform, profile) {
  const text = buffer.toString('utf8');
  if (file === 'mobile/eas.json') {
    const eas = JSON.parse(text), build = structuredClone(eas.build?.[profile]);
    assert(build && !build.extends, 'Selected release profile must be explicit; inherited profiles require a reviewed resolver.');
    delete build[platform === 'ios' ? 'android' : 'ios'];
    return { cli: eas.cli, build: { [profile]: build } };
  }
  if (file === 'packages/api-client/src/generated/v1.ts') {
    // These unions mirror the allocation ledger, not executable client behavior.
    // Keep the surrounding schema and every other enum in the digest.
    return byteHash(Buffer.from(text.replace(/(platform\?: "(?:web|android_phone|wear_os|ios)";\r?\n\s*\/\*\* @enum \{unknown\} \*\/\r?\n\s*version\?: )"\d+\.\d+\.\d+"(?: \| "\d+\.\d+\.\d+")*;/g, '$1"<allocated>";')));
  }
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
export function releaseInputs(root, source, { execute = execFileSync, nativePackages, profile = 'production' } = {}) {
  assert(SHA.test(source), 'Input snapshot requires a full source SHA.');
  assert(['internal', 'production'].includes(profile), 'Input snapshot requires a supported build profile.');
  const git = args => execute('git', ['--no-replace-objects', '-c', 'core.quotepath=false', ...args],
    { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const modes = new Map(git(['ls-tree', '-rz', source]).toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = /^(\d{6}) (blob|commit) [a-f0-9]{40}\t(.+)$/.exec(line);
    assert(match, 'Source tree contains an unsupported path or entry.'); return [match[3], { mode: match[1], type: match[2] }];
  }));
  const files = new Set(modes.keys());
  const read = file => git(['show', `${source}:${file}`]);
  const lock = JSON.parse(read('package-lock.json'));
  const mobileDependencies = dependencyClosure(lock, 'mobile', { buildTools: ['typescript', 'babel-preset-expo'] });
  const backendDependencies = dependencyClosure(JSON.parse(read('backend/package-lock.json')), '', { buildTools: ['typescript', 'prisma', 'tsx'] });
  if (!nativePackages) {
    nativePackages = { android: new Set(), ios: new Set() };
    for (const [key, entry] of Object.entries(mobileDependencies)) {
      if (!key.includes('node_modules/') || entry.link) continue;
      const directory = path.join(root, key), metadata = path.join(directory, 'package.json');
      if (entry.optional) {
        // An OS-specific optional package may be absent on this runner. Its locked
        // bytes remain conservatively native inputs on both target platforms.
        nativePackages.android.add(key); nativePackages.ios.add(key);
        if (!fs.existsSync(metadata)) continue;
      }
      assert(fs.existsSync(metadata), 'Install the exact locked workspace dependencies before native fingerprinting.');
      assert.equal(JSON.parse(fs.readFileSync(metadata)).version, entry.version, 'Installed package differs from lockfile.');
      for (const platform of ['android', 'ios']) {
        const modulePath = path.join(directory, 'expo-module.config.json');
        const module = fs.existsSync(modulePath) ? JSON.parse(fs.readFileSync(modulePath)) : {};
        if (fs.existsSync(path.join(directory, platform)) || module.platforms?.includes(platform === 'ios' ? 'apple' : platform) ||
          module[platform] || fs.existsSync(path.join(directory, 'app.plugin.js')) ||
          fs.existsSync(path.join(directory, 'react-native.config.js')) ||
          /node_modules\/(expo|react-native|hermes-engine|@expo\/(config|config-plugins|image-utils|prebuild-config|sdk-runtime-versions))$/.test(key)) nativePackages[platform].add(key);
      }
    }
  }
  function snapshot(platform, native) {
    const values = [];
    for (const file of [...files].sort()) {
      if (!relevantPlatformFile(file, platform, files) || file.endsWith('package-lock.json') || file === 'shared/client-diagnostic-versions.json') continue;
      const client = /^(mobile|shared|packages)\//.test(file);
      const nativeFile = /^(mobile\/(app\.(json|config\.js)|eas\.json|gradle(?:\/|\.)|plugins\/|modules\/|assets\/.*(?:icon|splash))|wear\/)/.test(file) ||
        file === (platform === 'ios' ? 'shared/ios-release.json' : 'shared/release.json');
      // Planning/journal/reconciliation helpers do not enter an artifact. Hash the
      // maintained build/export tooling that actually determines its contents.
      const tool = (platform === 'web' ? /^scripts\/expo-(?:cli-environment|web-build|web-release)\.mjs$/
        : platform === 'ios' ? /^scripts\/(ios-(?:artifact|ota-artifact)|expo-(?:ota-artifact|export)|build-)/
          : /^scripts\/(native-(?:release-build|internal-release|config|ota-contract)|wear-|expo-(?:ota-artifact|export)|build-)/).test(file) && !file.endsWith('.test.mjs');
      let include = platform === 'web' ? client || /^(backend|deploy)\//.test(file) || /^(Dockerfile|\.dockerignore|package\.json)/.test(file) || tool
        : native ? nativeFile || tool : client;
      // Native implementation files are not inputs to the web bundle in the server image.
      if (platform === 'web' && (file.startsWith('mobile/plugins/') || /^mobile\/modules\/[^/]+\/(android|ios)\//.test(file))) include = false;
      if ((!native || platform === 'web') && (file === 'mobile/eas.json' || /^mobile\/gradle(?:\/|\.)/.test(file))) include = false;
      if (platform === 'ios' && /^mobile\/gradle(?:\/|\.)/.test(file)) include = false;
      if (platform === 'ios' && (file.startsWith('wear/') || /\/android\//.test(file))) include = false;
      if (platform === 'android' && /\/ios\//.test(file)) include = false;
      if (include) {
        const entry = modes.get(file);
        assert(entry.type === 'blob' && ['100644', '100755'].includes(entry.mode), 'Artifact input is not a regular source file.');
        values.push([file, entry.mode, normalize(file, read(file), platform, profile)]);
      }
    }
    const dependencies = native ? Object.fromEntries(Object.entries(mobileDependencies).filter(([key]) => nativePackages[platform].has(key))) : mobileDependencies;
    return hash({ files: values, dependencies, ...(platform === 'web' ? { backendDependencies } : {}) });
  }
  return { server: snapshot('web', false), native: { android: snapshot('android', true), ios: snapshot('ios', true) },
    bundle: { android: snapshot('android', false), ios: snapshot('ios', false) } };
}
