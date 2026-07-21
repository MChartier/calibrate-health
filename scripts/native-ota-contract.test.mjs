import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createMobileLockSnapshot,
  createNativeRuntimeFingerprint,
  resolveExpoUpdateBuildConfig,
  writeNativeOtaBaseline
} from './native-ota-contract.mjs';

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ota-contract-'));
  for (const file of [
    'mobile/app.json',
    'mobile/app.config.js',
    'mobile/eas.json',
    'mobile/package.json',
    'mobile/assets/adaptive-icon.png',
    'mobile/assets/icon.png',
    'mobile/assets/notification-icon.png',
    'shared/release.json',
    'mobile/modules/example/android/build.gradle',
    'mobile/plugins/example.js',
    'wear/app/build.gradle.kts'
  ]) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const contents = file === 'mobile/app.json' ? '{"expo":{"version":"0.1.0"}}' : file;
    fs.writeFileSync(absolute, contents);
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    packages: {
      mobile: { dependencies: { expo: '~57.0.7' } },
      'node_modules/expo': { version: '57.0.7', dependencies: { '@expo/config': '1.0.0' } },
      'node_modules/@expo/config': { version: '1.0.0' },
      backend: { dependencies: { express: '5.0.0' } },
      'node_modules/express': { version: '5.0.0' }
    }
  }));
  return root;
}

test('native runtime fingerprint changes for native inputs but ignores OTA-safe source', () => {
  const root = createFixture();
  try {
    const initial = createNativeRuntimeFingerprint(root);
    fs.mkdirSync(path.join(root, 'mobile', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mobile', 'src', 'screen.tsx'), 'safe JS change');
    assert.equal(createNativeRuntimeFingerprint(root).sha256, initial.sha256);

    fs.writeFileSync(path.join(root, 'mobile', 'plugins', 'example.js'), 'native config change');
    assert.notEqual(createNativeRuntimeFingerprint(root).sha256, initial.sha256);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mobile lock snapshot ignores unrelated backend packages', () => {
  const base = {
    packages: {
      mobile: { dependencies: { expo: '57.0.7' } },
      'node_modules/expo': { version: '57.0.7' },
      backend: { dependencies: { express: '5.0.0' } },
      'node_modules/express': { version: '5.0.0' }
    }
  };
  const changedBackend = structuredClone(base);
  changedBackend.packages['node_modules/express'].version = '5.1.0';
  assert.deepEqual(createMobileLockSnapshot(base), createMobileLockSnapshot(changedBackend));

  const changedMobile = structuredClone(base);
  changedMobile.packages['node_modules/expo'].version = '57.0.8';
  assert.notDeepEqual(createMobileLockSnapshot(base), createMobileLockSnapshot(changedMobile));
});

test('OTA build config validates project UUID and update channel', () => {
  assert.deepEqual(resolveExpoUpdateBuildConfig({}), { projectId: null, channel: 'internal' });
  assert.deepEqual(resolveExpoUpdateBuildConfig({
    EXPO_PUBLIC_EAS_PROJECT_ID: '01234567-89ab-4def-8123-456789abcdef',
    EXPO_UPDATES_CHANNEL: 'production'
  }), {
    projectId: '01234567-89ab-4def-8123-456789abcdef',
    channel: 'production'
  });
  assert.throws(() => resolveExpoUpdateBuildConfig({ EXPO_PUBLIC_EAS_PROJECT_ID: 'bad' }), /project UUID/);
  assert.throws(() => resolveExpoUpdateBuildConfig({ EXPO_UPDATES_CHANNEL: 'bad channel' }), /EXPO_UPDATES_CHANNEL/);
});

test('OTA baseline records the exact native runtime contract without secrets', () => {
  const root = createFixture();
  try {
    const result = writeNativeOtaBaseline({
      root,
      environment: {
        EXPO_PUBLIC_EAS_PROJECT_ID: '01234567-89ab-4def-8123-456789abcdef',
        EXPO_UPDATES_CHANNEL: 'internal',
        EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://health.example',
        CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD: 'secret'
      },
      commit: 'abc123',
      createdAt: '2026-07-19T00:00:00.000Z'
    });
    assert.equal(result.baseline.runtime_version, '0.1.0');
    assert.equal(result.baseline.channel, 'internal');
    assert.equal(result.baseline.server_url, 'https://health.example');
    assert.equal(result.baseline.commit, 'abc123');
    assert.doesNotMatch(fs.readFileSync(result.output, 'utf8'), /secret/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
