import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  parseExpoOtaCiArgs,
  inspectNativeOtaCompatibility,
  readNativeBuildProject,
  readNativeOtaProjectPair,
  resolvePublishedNativeBuildTag,
  resolveNpmCiInvocation,
  verifyNativeOtaReleaseTarget,
  validateEasCiEnvironment,
  validateNativeOtaCompatibility
} from './expo-ota-ci-preflight.mjs';

function createFingerprintFixture({ dependencyVersion = null, nativeMetadata = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ota-ci-fingerprint-'));
  const files = {
    'mobile/app.json': JSON.stringify({ expo: { version: '0.2.6' } }),
    'mobile/app.config.js': 'export default {};',
    'mobile/eas.json': '{}',
    'mobile/assets/adaptive-icon.png': 'adaptive icon',
    'mobile/assets/icon.png': 'icon',
    'mobile/assets/notification-icon.png': 'notification icon'
  };
  for (const [file, contents] of Object.entries(files)) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  const dependencies = dependencyVersion ? { 'native-addon': dependencyVersion } : {};
  const packages = {
    '': { name: 'ota-fixture', version: '1.0.0' },
    mobile: { name: 'mobile', version: '0.2.6', dependencies }
  };
  if (dependencyVersion) {
    packages['node_modules/native-addon'] = {
      version: dependencyVersion,
      resolved: `https://registry.example/native-addon-${dependencyVersion}.tgz`,
      integrity: `sha512-${dependencyVersion}`
    };
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  if (dependencyVersion) {
    const packageDirectory = path.join(root, 'node_modules', 'native-addon');
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({
      name: 'native-addon',
      version: dependencyVersion
    }));
    if (nativeMetadata) {
      fs.mkdirSync(path.join(packageDirectory, 'android'), { recursive: true });
      fs.writeFileSync(path.join(packageDirectory, 'android', 'build.gradle'), 'native addon');
    }
  }
  return root;
}

function installNativeAddonFixture(root, version) {
  const packageDirectory = path.join(root, 'node_modules', 'native-addon');
  fs.mkdirSync(path.join(packageDirectory, 'android'), { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({
    name: 'native-addon',
    version
  }));
  fs.writeFileSync(path.join(packageDirectory, 'android', 'build.gradle'), 'native addon');
}

test('OTA CI CLI requires explicit native-build targeting inputs', () => {
  assert.deepEqual(parseExpoOtaCiArgs([
    '--native-build-ref', 'native-v0.2.4',
    '--channel', 'production',
    '--environment', 'production',
    '--environment-file', 'eas.env'
  ]), {
    nativeBuildRef: 'native-v0.2.4',
    channel: 'production',
    environment: 'production',
    environmentFile: 'eas.env',
    compatibilityOutput: null,
    readinessOutput: null,
    allowedSignersFile: null,
    environmentOnly: false,
    repositoryRoot: null,
    help: false
  });
  assert.deepEqual(parseExpoOtaCiArgs([
    '--native-build-ref', 'native-v0.2.6',
    '--compatibility-output', 'github-output.txt',
    '--allowed-signers-file', 'allowed-signers',
    '--repository-root', 'prepared-source'
  ]), {
    nativeBuildRef: 'native-v0.2.6',
    channel: null,
    environment: null,
    environmentFile: null,
    compatibilityOutput: 'github-output.txt',
    readinessOutput: null,
    allowedSignersFile: 'allowed-signers',
    environmentOnly: false,
    repositoryRoot: 'prepared-source',
    help: false
  });
  assert.deepEqual(parseExpoOtaCiArgs([
    '--channel', 'internal',
    '--environment', 'preview',
    '--environment-file', 'eas.env',
    '--allowed-signers-file', 'allowed-signers',
    '--environment-only'
  ]), {
    nativeBuildRef: null,
    channel: 'internal',
    environment: 'preview',
    environmentFile: 'eas.env',
    compatibilityOutput: null,
    readinessOutput: null,
    allowedSignersFile: 'allowed-signers',
    environmentOnly: true,
    repositoryRoot: null,
    help: false
  });
  assert.deepEqual(parseExpoOtaCiArgs([
    '--native-build-ref', 'native-v0.2.6',
    '--readiness-output', 'release-target.env',
    '--allowed-signers-file', 'allowed-signers',
    '--repository-root', 'prepared-source'
  ]), {
    nativeBuildRef: 'native-v0.2.6',
    channel: null,
    environment: null,
    environmentFile: null,
    compatibilityOutput: null,
    readinessOutput: 'release-target.env',
    allowedSignersFile: 'allowed-signers',
    environmentOnly: false,
    repositoryRoot: 'prepared-source',
    help: false
  });
  assert.throws(() => parseExpoOtaCiArgs(['--unknown']), /Unknown Expo OTA CI option/);
});

test('OTA CI readiness binds the exact source to the signed origin native tag ancestry', () => {
  const tag = 'native-v0.2.6';
  const tagObject = 'a'.repeat(40);
  const nativeCommit = 'b'.repeat(40);
  const sourceCommit = 'c'.repeat(40);
  const remote = `${tagObject}\trefs/tags/${tag}\n${nativeCommit}\trefs/tags/${tag}^{}\n`;
  const calls = [];
  const releaseTarget = verifyNativeOtaReleaseTarget('/selected-source', tag, {
    allowedSigners: 'calibrate-native-release ssh-ed25519 fixture',
    commandRunner: (_command, args) => {
      calls.push(args);
      if (args[1] === 'ls-remote') return { status: 0, stdout: remote, stderr: '' };
      if (args[1] === 'fetch') return { status: 0, stdout: '', stderr: '' };
      if (args[1] === 'rev-parse' && args.at(-1) === `refs/tags/${tag}^{tag}`) {
        return { status: 0, stdout: `${tagObject}\n`, stderr: '' };
      }
      if (args[1] === 'rev-parse' && args.at(-1) === 'HEAD^{commit}') {
        return { status: 0, stdout: `${sourceCommit}\n`, stderr: '' };
      }
      if (args[1] === 'merge-base') return { status: 0, stdout: '', stderr: '' };
      throw new Error(`Unexpected Git command: ${args.join(' ')}`);
    },
    attestationVerifier: () => ({
      tag,
      expectedCommit: nativeCommit,
      tagObject
    })
  });

  assert.deepEqual(releaseTarget, {
    sourceCommit,
    nativeBuildRef: tag,
    nativeBuildCommit: nativeCommit,
    nativeTagObject: tagObject
  });
  assert.deepEqual(calls.at(-1), [
    '--no-replace-objects',
    'merge-base',
    '--is-ancestor',
    nativeCommit,
    sourceCommit
  ]);
});

test('OTA CI readiness fails when the source does not descend from the signed native tag', () => {
  const tag = 'native-v0.2.6';
  const tagObject = 'a'.repeat(40);
  const nativeCommit = 'b'.repeat(40);
  const sourceCommit = 'c'.repeat(40);
  const remote = `${tagObject}\trefs/tags/${tag}\n${nativeCommit}\trefs/tags/${tag}^{}\n`;
  assert.throws(
    () => verifyNativeOtaReleaseTarget('/selected-source', tag, {
      allowedSigners: 'fixture',
      commandRunner: (_command, args) => {
        if (args[1] === 'ls-remote') return { status: 0, stdout: remote, stderr: '' };
        if (args[1] === 'fetch') return { status: 0, stdout: '', stderr: '' };
        if (args[1] === 'rev-parse' && args.at(-1) === `refs/tags/${tag}^{tag}`) {
          return { status: 0, stdout: `${tagObject}\n`, stderr: '' };
        }
        if (args[1] === 'rev-parse') return { status: 0, stdout: `${sourceCommit}\n`, stderr: '' };
        if (args[1] === 'merge-base') return { status: 1, stdout: '', stderr: '' };
        throw new Error(`Unexpected Git command: ${args.join(' ')}`);
      },
      attestationVerifier: () => ({ tag, expectedCommit: nativeCommit, tagObject })
    }),
    /does not descend from the installed signed native release tag/
  );
});

test('OTA CI resolves only the exact origin annotated native tag and verifies its signed target', () => {
  const tag = 'native-v0.2.6';
  const tagObject = 'a'.repeat(40);
  const commit = 'b'.repeat(40);
  const remote = `${tagObject}\trefs/tags/${tag}\n${commit}\trefs/tags/${tag}^{}\n`;
  const calls = [];
  let attestationOptions;
  const result = resolvePublishedNativeBuildTag('/selected-source', tag, {
    allowedSigners: 'calibrate-native-release ssh-ed25519 fixture',
    commandRunner: (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (args[1] === 'ls-remote') return { status: 0, stdout: remote, stderr: '' };
      if (args[1] === 'fetch') return { status: 0, stdout: '', stderr: '' };
      if (args[1] === 'rev-parse') return { status: 0, stdout: `${tagObject}\n`, stderr: '' };
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
    attestationVerifier: (options) => {
      attestationOptions = options;
      return {
        tag,
        expectedCommit: commit,
        tagObject,
        verifiedKeyFingerprint: 'SHA256:fixture'
      };
    }
  });

  assert.equal(result.tag, tag);
  assert.equal(result.commit, commit);
  assert.equal(result.tagObject, tagObject);
  assert.deepEqual(attestationOptions, {
    repositoryRoot: '/selected-source',
    tag,
    expectedCommit: commit,
    allowedSigners: 'calibrate-native-release ssh-ed25519 fixture'
  });
  assert.deepEqual(calls.map(({ args }) => args), [
    ['--no-replace-objects', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    ['--no-replace-objects', 'fetch', '--no-tags', '--force', 'origin', `+refs/tags/${tag}:refs/tags/${tag}`],
    ['--no-replace-objects', 'rev-parse', '--verify', `refs/tags/${tag}^{tag}`],
    ['--no-replace-objects', 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]
  ]);
});

test('OTA CI rejects revision expressions, SHAs, branches, and local-only or lightweight native tags', () => {
  const invalidRefs = [
    'HEAD',
    'master',
    'a'.repeat(40),
    'native-v0.2.6^{}',
    'refs/tags/native-v0.2.6',
    '-native-v0.2.6'
  ];
  for (const nativeBuildRef of invalidRefs) {
    assert.throws(
      () => resolvePublishedNativeBuildTag('/selected-source', nativeBuildRef, {
        allowedSigners: 'fixture',
        commandRunner: () => {
          throw new Error('invalid refs must fail before Git');
        }
      }),
      /must be exactly native-vMAJOR\.MINOR\.PATCH/
    );
  }

  for (const stdout of [
    '',
    `${'a'.repeat(40)}\trefs/tags/native-v0.2.6\n`
  ]) {
    assert.throws(
      () => resolvePublishedNativeBuildTag('/selected-source', 'native-v0.2.6', {
        allowedSigners: 'fixture',
        commandRunner: (_command, args) => {
          assert.deepEqual(args.slice(0, 2), ['--no-replace-objects', 'ls-remote']);
          return { status: 0, stdout, stderr: '' };
        }
      }),
      /must publish .* as one signed annotated native tag/
    );
  }
});

test('OTA CI fails closed for unsigned, wrong-key, wrong-target, and changing origin tags', () => {
  const tag = 'native-v0.2.6';
  const tagObject = 'a'.repeat(40);
  const changedTagObject = 'c'.repeat(40);
  const commit = 'b'.repeat(40);
  const advertisement = (object = tagObject) =>
    `${object}\trefs/tags/${tag}\n${commit}\trefs/tags/${tag}^{}\n`;

  for (const reason of ['unsigned tag', 'wrong signing key', 'wrong target commit']) {
    assert.throws(
      () => resolvePublishedNativeBuildTag('/selected-source', tag, {
        allowedSigners: 'fixture',
        commandRunner: (_command, args) => {
          if (args[1] === 'ls-remote') return { status: 0, stdout: advertisement(), stderr: '' };
          if (args[1] === 'fetch') return { status: 0, stdout: '', stderr: '' };
          return { status: 0, stdout: `${tagObject}\n`, stderr: '' };
        },
        attestationVerifier: () => {
          throw new Error(reason);
        }
      }),
      new RegExp(reason)
    );
  }

  let remoteRead = 0;
  assert.throws(
    () => resolvePublishedNativeBuildTag('/selected-source', tag, {
      allowedSigners: 'fixture',
      commandRunner: (_command, args) => {
        if (args[1] === 'ls-remote') {
          remoteRead += 1;
          return {
            status: 0,
            stdout: advertisement(remoteRead === 1 ? tagObject : changedTagObject),
            stderr: ''
          };
        }
        if (args[1] === 'fetch') return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: `${tagObject}\n`, stderr: '' };
      },
      attestationVerifier: () => ({ tag, expectedCommit: commit, tagObject })
    }),
    /changed on origin/
  );
});

function runFixtureCommand(command, args, cwd) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
  );
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : os.devNull;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_TERMINAL_PROMPT = '0';
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: environment,
    shell: false,
    windowsHide: true
  });
}

test('OTA CI ignores replacement refs when reading a real signed native baseline tree', (t) => {
  const sshProbe = runFixtureCommand('ssh-keygen', ['-?'], process.cwd());
  if (sshProbe.error?.code === 'ENOENT') {
    t.skip('ssh-keygen is unavailable on this host');
    return;
  }

  const root = createFingerprintFixture();
  const auxiliary = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-ota-ci-replace-'));
  const origin = path.join(auxiliary, 'origin.git');
  const signingKey = path.join(auxiliary, 'native-tag-key');
  const tag = 'native-v0.2.6';
  const git = (args, cwd = root) => runFixtureCommand('git', args, cwd);
  try {
    assert.equal(git(['init', '--quiet']).status, 0);
    assert.equal(git(['branch', '-M', 'master']).status, 0);
    assert.equal(git(['config', 'user.name', 'Release Test']).status, 0);
    assert.equal(git(['config', 'user.email', 'release-test@example.com']).status, 0);
    assert.equal(git(['add', '.']).status, 0);
    assert.equal(git(['commit', '--quiet', '-m', 'signed native baseline']).status, 0);
    const baselineCommit = git(['rev-parse', 'HEAD']).stdout.trim();

    assert.equal(
      runFixtureCommand(
        'ssh-keygen',
        ['-q', '-t', 'ed25519', '-N', '', '-f', signingKey],
        auxiliary
      ).status,
      0
    );
    const signedTag = git([
      '-c', 'gpg.format=ssh',
      '-c', `user.signingkey=${signingKey}`,
      'tag', '-s', '-a', tag, '-m', 'signed native baseline'
    ]);
    if (signedTag.status !== 0 && /unsupported|not supported|unknown value/i.test(signedTag.stderr)) {
      t.skip(`Git SSH signing is unavailable: ${signedTag.stderr.trim()}`);
      return;
    }
    assert.equal(signedTag.status, 0, signedTag.stderr);
    const tagObject = git(['rev-parse', `${tag}^{tag}`]).stdout.trim();

    assert.equal(git(['checkout', '--quiet', '-b', 'attacker']).status, 0);
    const attackerConfigPath = path.join(root, 'mobile', 'app.json');
    const attackerConfig = JSON.parse(fs.readFileSync(attackerConfigPath, 'utf8'));
    attackerConfig.expo.version = '9.9.9';
    fs.writeFileSync(attackerConfigPath, JSON.stringify(attackerConfig));
    assert.equal(git(['add', 'mobile/app.json']).status, 0);
    assert.equal(git(['commit', '--quiet', '-m', 'attacker replacement tree']).status, 0);
    const attackerCommit = git(['rev-parse', 'HEAD']).stdout.trim();

    assert.equal(git(['checkout', '--quiet', 'master']).status, 0);
    fs.writeFileSync(path.join(root, 'release-note.txt'), 'compatible OTA source\n');
    assert.equal(git(['add', 'release-note.txt']).status, 0);
    assert.equal(git(['commit', '--quiet', '-m', 'compatible OTA source']).status, 0);

    assert.equal(git(['init', '--bare', '--quiet', origin], auxiliary).status, 0);
    assert.equal(git(['remote', 'add', 'origin', origin]).status, 0);
    assert.equal(git(['push', '--quiet', '--set-upstream', 'origin', 'master']).status, 0);
    assert.equal(git(['push', '--quiet', 'origin', `refs/tags/${tag}`]).status, 0);
    assert.equal(git(['replace', baselineCommit, attackerCommit]).status, 0);

    const replacedConfig = JSON.parse(
      git(['show', `${baselineCommit}:mobile/app.json`]).stdout
    );
    assert.equal(replacedConfig.expo.version, '9.9.9', 'replacement ref must be active for this regression');

    const approvedKey = fs.readFileSync(`${signingKey}.pub`, 'utf8').trim();
    const result = readNativeBuildProject(root, tag, {
      allowedSigners: `calibrate-native-release ${approvedKey}\n`
    });
    assert.equal(result.commit, baselineCommit);
    assert.equal(result.project.appVersion, '0.2.6');
    assert.equal(result.currentProject.appVersion, '0.2.6');
    assert.equal(result.project.nativeFingerprint, result.currentProject.nativeFingerprint);
    assert.match(tagObject, /^[0-9a-f]{40}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(auxiliary, { recursive: true, force: true });
  }
});

test('OTA CI accepts only the exact compatible native runtime', () => {
  const installed = { appVersion: '0.2.2', nativeFingerprint: 'abc' };
  validateNativeOtaCompatibility(installed, { ...installed });
  assert.throws(
    () => validateNativeOtaCompatibility(installed, { ...installed, appVersion: '0.2.3' }),
    /Native app version changed/
  );
  assert.throws(
    () => validateNativeOtaCompatibility(installed, { ...installed, nativeFingerprint: 'def' }),
    /Native runtime inputs changed/
  );
  assert.deepEqual(inspectNativeOtaCompatibility(installed, { ...installed }), {
    compatible: true,
    reason: 'compatible'
  });
  assert.deepEqual(
    inspectNativeOtaCompatibility(installed, { ...installed, appVersion: '0.2.6' }),
    {
      compatible: false,
      reason: 'app-version-mismatch',
      message: 'Native app version changed from 0.2.2 to 0.2.6. Create and install a new signed phone build instead of publishing OTA.'
    }
  );
  assert.deepEqual(
    inspectNativeOtaCompatibility(installed, { ...installed, nativeFingerprint: 'def' }),
    {
      compatible: false,
      reason: 'native-fingerprint-mismatch',
      message: 'Native runtime inputs changed after the installed build. Create and install a new signed phone/Watch build instead of publishing OTA.'
    }
  );
});

test('OTA CI fingerprints a native dependency removed from the current tree', () => {
  const currentRoot = createFingerprintFixture();
  const baselineRoot = createFingerprintFixture({ dependencyVersion: '1.0.0' });
  const commands = [];
  try {
    const pair = readNativeOtaProjectPair(currentRoot, baselineRoot, {
      platform: 'linux',
      npmExecPath: null,
      commandRunner: (command, args, cwd) => {
        commands.push({ command, args, cwd });
        installNativeAddonFixture(baselineRoot, '1.0.0');
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    assert.deepEqual(commands, [{
      command: 'npm',
      args: ['ci', '--ignore-scripts', '--no-audit', '--fund=false'],
      cwd: baselineRoot
    }]);
    assert.equal(pair.installedBaselineDependencies, true);
    assert.deepEqual(pair.nativePackageNames, ['native-addon']);
    assert.notEqual(pair.baseline.nativeFingerprint, pair.current.nativeFingerprint);
    assert.equal(inspectNativeOtaCompatibility(pair.baseline, pair.current).compatible, false);
  } finally {
    fs.rmSync(currentRoot, { recursive: true, force: true });
    fs.rmSync(baselineRoot, { recursive: true, force: true });
  }
});

test('OTA CI installs the differing baseline before discovering a native-to-JS transition', () => {
  const currentRoot = createFingerprintFixture({ dependencyVersion: '2.0.0' });
  const baselineRoot = createFingerprintFixture({ dependencyVersion: '1.0.0' });
  let baselineInstalled = false;
  try {
    const pair = readNativeOtaProjectPair(currentRoot, baselineRoot, {
      platform: 'linux',
      npmExecPath: null,
      commandRunner: (_command, _args, cwd) => {
        assert.equal(cwd, baselineRoot);
        installNativeAddonFixture(baselineRoot, '1.0.0');
        baselineInstalled = true;
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    assert.equal(baselineInstalled, true);
    assert.deepEqual(pair.nativePackageNames, ['native-addon']);
    assert.notEqual(pair.baseline.nativeFingerprint, pair.current.nativeFingerprint);
  } finally {
    fs.rmSync(currentRoot, { recursive: true, force: true });
    fs.rmSync(baselineRoot, { recursive: true, force: true });
  }
});

test('OTA CI reuses installed metadata without npm ci when dependency locks match', () => {
  const currentRoot = createFingerprintFixture({ dependencyVersion: '1.0.0', nativeMetadata: true });
  const baselineRoot = createFingerprintFixture({ dependencyVersion: '1.0.0' });
  try {
    const pair = readNativeOtaProjectPair(currentRoot, baselineRoot, {
      commandRunner: () => {
        throw new Error('npm ci must not run for matching locks');
      }
    });
    assert.equal(pair.installedBaselineDependencies, false);
    assert.deepEqual(pair.nativePackageNames, ['native-addon']);
    assert.equal(pair.baseline.nativeFingerprint, pair.current.nativeFingerprint);
  } finally {
    fs.rmSync(currentRoot, { recursive: true, force: true });
    fs.rmSync(baselineRoot, { recursive: true, force: true });
  }
});

test('OTA CI resolves npm ci without directly spawning npm.cmd on Windows', () => {
  assert.deepEqual(resolveNpmCiInvocation({
    platform: 'win32',
    nodeExecutable: 'C:\\node\\node.exe',
    npmExecPath: 'C:\\node\\npm-cli.js'
  }), {
    command: 'C:\\node\\node.exe',
    args: [
      'C:\\node\\npm-cli.js',
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--fund=false'
    ]
  });
  assert.deepEqual(resolveNpmCiInvocation({
    platform: 'win32',
    npmExecPath: null
  }), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm', 'ci', '--ignore-scripts', '--no-audit', '--fund=false']
  });
});

test('OTA CI validates the selected EAS environment contract', () => {
  const projectId = '01234567-89ab-4def-8123-456789abcdef';
  const expected = { projectId, channel: 'production', environment: 'production' };
  assert.deepEqual(validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'production',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://calibrate.example'
  }, expected), {
    projectId,
    channel: 'production',
    serverUrl: 'https://calibrate.example'
  });
  assert.throws(() => validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'internal',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'https://calibrate.example'
  }, expected), /targets channel internal/);
  assert.throws(() => validateEasCiEnvironment({
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    EXPO_UPDATES_CHANNEL: 'production',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: 'http:\/\/calibrate.example'
  }, expected), /must use an HTTPS/);
});
