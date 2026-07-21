import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeNativeOtaBaseline } from './native-ota-contract.mjs';
import {
  nativeOtaPublishCommand,
  parseEasEnvironmentFile,
  parseDirtyPaths,
  parseNativeOtaArgs,
  runNativeOtaUpdate,
  validateEasUpdateEnvironment
} from './native-ota-update.mjs';

function createOtaFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ota-update-'));
  const files = {
    'mobile/app.json': '{"expo":{"version":"0.1.0"}}',
    'mobile/app.config.js': 'module.exports = ({ config }) => config;',
    'mobile/eas.json': '{}',
    'mobile/package.json': '{"dependencies":{"expo-updates":"~57.0.8"}}',
    'mobile/assets/adaptive-icon.png': 'adaptive',
    'mobile/assets/icon.png': 'icon',
    'mobile/assets/notification-icon.png': 'notification',
    'package-lock.json': '{"packages":{"mobile":{"dependencies":{"expo-updates":"~57.0.8"}},"node_modules/expo-updates":{"version":"57.0.8"}}}',
    'shared/release.json': '{}',
    'mobile/modules/example/android/build.gradle': 'module',
    'mobile/plugins/example.js': 'plugin',
    'wear/app/build.gradle.kts': 'wear'
  };
  for (const [file, contents] of Object.entries(files)) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

test('OTA CLI parses explicit release targeting options', () => {
  assert.deepEqual(parseNativeOtaArgs([
    '--baseline', 'baseline.json',
    '--channel', 'internal',
    '--environment', 'preview',
    '--message', 'Fix food logging',
    '--non-interactive',
    '--dry-run'
  ]), {
    baseline: 'baseline.json',
    channel: 'internal',
    environment: 'preview',
    message: 'Fix food logging',
    nonInteractive: true,
    dryRun: true,
    help: false
  });
  assert.throws(() => parseNativeOtaArgs(['--bad']), /Unknown native OTA option/);
});

test('OTA publish command targets Android and the build channel', () => {
  const command = nativeOtaPublishCommand({
    channel: null,
    environment: null,
    message: 'Fix food logging',
    nonInteractive: true
  }, { channel: 'internal' }, 'win32');
  assert.equal(command.command, 'npx.cmd');
  assert.equal(command.channel, 'internal');
  assert.equal(command.environment, 'preview');
  assert.deepEqual(command.args.slice(-3), ['--platform', 'android', '--non-interactive']);
  assert.throws(
    () => nativeOtaPublishCommand({ channel: 'production', message: 'x' }, { channel: 'internal' }),
    /pinned to the internal channel/
  );
});

test('OTA environment parsing supports the values emitted by eas env:pull', () => {
  assert.deepEqual(parseEasEnvironmentFile([
    '# Environment: preview',
    'EXPO_PUBLIC_CALIBRATE_SERVER_URL="https://health.example"',
    "EXPO_PUBLIC_EAS_PROJECT_ID='01234567-89ab-4def-8123-456789abcdef'",
    'EXPO_UPDATES_CHANNEL=internal # selected build channel'
  ].join('\n')), {
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://health.example',
    EXPO_PUBLIC_EAS_PROJECT_ID: '01234567-89ab-4def-8123-456789abcdef',
    EXPO_UPDATES_CHANNEL: 'internal'
  });
});

test('OTA publishing rejects missing or mismatched EAS baseline values', () => {
  const baseline = {
    server_url: 'https://health.example',
    project_id: '01234567-89ab-4def-8123-456789abcdef',
    channel: 'internal'
  };
  assert.throws(
    () => validateEasUpdateEnvironment({
      EXPO_PUBLIC_EAS_PROJECT_ID: baseline.project_id,
      EXPO_UPDATES_CHANNEL: baseline.channel
    }, baseline, 'preview'),
    /does not define EXPO_PUBLIC_CALIBRATE_SERVER_URL/
  );
  assert.throws(
    () => validateEasUpdateEnvironment({
      EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://public.example',
      EXPO_PUBLIC_EAS_PROJECT_ID: baseline.project_id,
      EXPO_UPDATES_CHANNEL: baseline.channel
    }, baseline, 'preview'),
    /installed build baseline requires https:\/\/health\.example/
  );
});

test('OTA cleanliness ignores Codex UI artifacts but not application changes', () => {
  const paths = parseDirtyPaths([
    '?? .codex-remote-attachments/screenshot.png',
    '?? .codex-screenshots/device.png',
    ' M mobile/app/today.tsx',
    'R  mobile/app/old.tsx -> mobile/app/new.tsx'
  ].join('\n'));
  assert.deepEqual(paths, ['mobile/app/today.tsx', 'mobile/app/new.tsx']);
});

test('OTA dry run validates and reuses the exact installed build contract', () => {
  const root = createOtaFixture();
  try {
    writeNativeOtaBaseline({
      root,
      environment: {
        EXPO_PUBLIC_EAS_PROJECT_ID: '01234567-89ab-4def-8123-456789abcdef',
        EXPO_UPDATES_CHANNEL: 'internal',
        EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://health.example'
      }
    });
    const result = runNativeOtaUpdate({
      repositoryRoot: root,
      environment: {},
      platform: 'win32',
      config: {
        baseline: null,
        channel: null,
        environment: null,
        message: 'Fix food logging',
        nonInteractive: false,
        dryRun: true,
        help: false
      },
      runner: (request) => {
        if (request.command === 'git') {
          assert.equal(request.args[0], 'status');
          return { status: 0, stdout: '', stderr: '' };
        }
        assert.equal(request.command, 'npx.cmd');
        assert.equal(request.args[2], 'env:pull');
        const environmentFile = request.args[request.args.indexOf('--path') + 1];
        fs.writeFileSync(environmentFile, [
          'EXPO_PUBLIC_CALIBRATE_SERVER_URL=https://health.example',
          'EXPO_PUBLIC_EAS_PROJECT_ID=01234567-89ab-4def-8123-456789abcdef',
          'EXPO_UPDATES_CHANNEL=internal'
        ].join('\n'));
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.publish.channel, 'internal');
    assert.equal(result.baseline.server_url, 'https://health.example');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OTA dry run fails when the selected EAS environment would override the installed server', () => {
  const root = createOtaFixture();
  try {
    writeNativeOtaBaseline({
      root,
      environment: {
        EXPO_PUBLIC_EAS_PROJECT_ID: '01234567-89ab-4def-8123-456789abcdef',
        EXPO_UPDATES_CHANNEL: 'internal',
        EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://health.example'
      }
    });
    assert.throws(() => runNativeOtaUpdate({
      repositoryRoot: root,
      environment: {},
      platform: 'win32',
      config: {
        baseline: null,
        channel: null,
        environment: 'preview',
        message: 'Fix food logging',
        nonInteractive: false,
        dryRun: true,
        help: false
      },
      runner: (request) => {
        if (request.command === 'git') return { status: 0, stdout: '', stderr: '' };
        const environmentFile = request.args[request.args.indexOf('--path') + 1];
        fs.writeFileSync(environmentFile, [
          'EXPO_PUBLIC_CALIBRATE_SERVER_URL=https://public.example',
          'EXPO_PUBLIC_EAS_PROJECT_ID=01234567-89ab-4def-8123-456789abcdef',
          'EXPO_UPDATES_CHANNEL=internal'
        ].join('\n'));
        return { status: 0, stdout: '', stderr: '' };
      }
    }), /installed build baseline requires https:\/\/health\.example/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
