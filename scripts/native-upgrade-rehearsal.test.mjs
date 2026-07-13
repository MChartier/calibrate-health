import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPLICATION_ID,
  assertArtifactSet,
  buildCheckout,
  executeUpgradeInstallSequence,
  parseApkBadging,
  parseNativeUpgradeArgs,
  parsePackageDump,
  parseSignerFingerprint,
  overrideCheckoutVersions,
  removeOwnedTempRoot,
  resolveNativeUpgradeTooling,
  runNativeUpgradeRehearsal,
  signingEnvironment,
  verifyAdbUpgradeTargets
} from './native-upgrade-rehearsal.mjs';

const PHONE_SERIAL = 'emulator-5554';
const WEAR_SERIAL = 'emulator-5556';

function validArgs(extra = []) {
  return [
    '--baseline', 'a99fcb8',
    '--phone-serial', PHONE_SERIAL,
    '--wear-serial', WEAR_SERIAL,
    ...extra
  ];
}

function packageDump(versionCode, firstInstallTime = '2026-07-13 10:00:00') {
  return `
    versionCode=${versionCode} minSdk=26 targetSdk=36
    versionName=0.1.0
    lastUpdateTime=2026-07-13 10:05:00
    signatures=PackageSignatures{123 version:2, signatures:[51ed3f60], past signatures:[]}
      firstInstallTime=${firstInstallTime}
  `;
}

test('CLI is dry-run by default and requires explicit emulator serials', () => {
  const parsed = parseNativeUpgradeArgs(validArgs());
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.candidateRef, 'HEAD');
  assert.equal(parsed.baselineVersionCode, 1);
  assert.equal(parsed.candidateVersionCode, 2);
  assert.equal(parseNativeUpgradeArgs(validArgs(['--package-only'])).packageOnly, true);
  assert.throws(
    () => parseNativeUpgradeArgs(['--baseline', 'a99fcb8']),
    /phone-serial and --wear-serial are required/
  );
});

test('temporary version override keeps phone, Wear, pairing module, and release manifest aligned', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-upgrade-version-test-'));
  try {
    for (const directory of [
      ['mobile'], ['shared'], ['wear', 'app'], ['mobile', 'modules', 'wear-pairing', 'android']
    ]) fs.mkdirSync(path.join(root, ...directory), { recursive: true });
    fs.writeFileSync(path.join(root, 'mobile', 'app.json'), JSON.stringify({ expo: { android: { versionCode: 1 } } }));
    fs.writeFileSync(path.join(root, 'shared', 'release.json'), JSON.stringify({
      android: { mobile: { version_code: 1 }, wear: { version_code: 1 } }
    }));
    fs.writeFileSync(path.join(root, 'wear', 'app', 'build.gradle.kts'), 'versionCode = 1\n');
    fs.writeFileSync(
      path.join(root, 'mobile', 'modules', 'wear-pairing', 'android', 'build.gradle'),
      'versionCode 1\n'
    );
    overrideCheckoutVersions(root, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'))).expo.android.versionCode, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'release.json'))).android, {
      mobile: { version_code: 2 }, wear: { version_code: 2 }
    });
    assert.match(fs.readFileSync(path.join(root, 'wear', 'app', 'build.gradle.kts'), 'utf8'), /versionCode = 2/);
    assert.match(
      fs.readFileSync(path.join(root, 'mobile', 'modules', 'wear-pairing', 'android', 'build.gradle'), 'utf8'),
      /versionCode 2/
    );
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});

test('build sequence runs release mirror validation after prebuild and before Gradle', async () => {
  const labels = [];
  const artifacts = await buildCheckout(
    'candidate',
    path.join('C:', 'owned-temp', 'candidate'),
    { npmCli: 'npm-cli.js', java: 'java' },
    {},
    async (request) => {
      labels.push(request.label);
      if (request.label === 'build candidate phone APK') {
        assert.ok(request.args.includes('-PreactNativeArchitectures=x86_64'));
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    'x86_64'
  );
  assert.deepEqual(labels, [
    'install candidate dependencies',
    'prebuild candidate phone',
    'verify candidate release mirrors',
    'build candidate phone APK',
    'build candidate Wear APK'
  ]);
  assert.match(artifacts.phone, /app-release\.apk$/);
});

test('historical builds receive an allowlisted environment without unrelated credentials', () => {
  const environment = signingEnvironment({
    Path: 'C:\\tools',
    TEMP: 'C:\\temp',
    GH_TOKEN: 'secret-github-token',
    DATABASE_URL: 'postgres://secret'
  }, {
    javaHome: 'C:\\Java',
    sdkRoot: 'C:\\Android'
  }, {
    file: 'C:\\temp\\disposable.p12',
    storePassword: 'store-secret',
    alias: 'calibrate',
    keyPassword: 'key-secret',
    serverUrl: 'https://health.example'
  });

  assert.equal(environment.Path, 'C:\\tools');
  assert.equal(environment.GH_TOKEN, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD, 'store-secret');
});

test('CLI requires a real version increase and a credential-free HTTPS origin', () => {
  assert.throws(
    () => parseNativeUpgradeArgs(validArgs(['--candidate-version-code', '1'])),
    /greater than the baseline/
  );
  assert.throws(
    () => parseNativeUpgradeArgs(validArgs(['--server-url', 'http://10.0.2.2:3000'])),
    /credential-free HTTPS origin/
  );
  assert.throws(
    () => parseNativeUpgradeArgs(validArgs(['--server-url', 'https://user@example.com'])),
    /credential-free HTTPS origin/
  );
});

test('APK and installed-package evidence parsers preserve upgrade identifiers', () => {
  assert.deepEqual(
    parseApkBadging("package: name='app.calibratehealth.mobile' versionCode='2' versionName='0.1.0' platformBuildVersionName='16'"),
    { applicationId: APPLICATION_ID, versionCode: 2, versionName: '0.1.0' }
  );
  assert.equal(
    parseSignerFingerprint('V2 Signer: certificate SHA-256 digest: FA:C6:17:45'),
    'fac61745'
  );
  assert.deepEqual(parsePackageDump(packageDump(2)), {
    versionCode: 2,
    versionName: '0.1.0',
    firstInstallTime: '2026-07-13 10:00:00',
    lastUpdateTime: '2026-07-13 10:05:00',
    packageSignature: 'signatures=PackageSignatures{123 version:2, signatures:[51ed3f60], past signatures:[]}'
  });
});

test('artifact gate requires application, version overrides, and one shared signer', () => {
  const artifact = (versionCode, signerSha256 = 'abc') => ({
    applicationId: APPLICATION_ID,
    versionCode,
    versionName: '0.1.0',
    signerSha256
  });
  const artifacts = {
    baseline: { phone: artifact(1), wear: artifact(1) },
    candidate: { phone: artifact(2), wear: artifact(2) }
  };
  assert.doesNotThrow(() => assertArtifactSet(artifacts, { baselineVersionCode: 1, candidateVersionCode: 2 }));
  artifacts.candidate.wear.signerSha256 = 'different';
  assert.throws(
    () => assertArtifactSet(artifacts, { baselineVersionCode: 1, candidateVersionCode: 2 }),
    /do not share one disposable signer/
  );
});

test('adb validation accepts only explicit phone and Wear emulators', async () => {
  const runner = async ({ args }) => {
    const joined = args.join(' ');
    if (joined === 'devices -l') {
      return {
        status: 0,
        stdout: `List of devices attached\n${PHONE_SERIAL} device model:Pixel_10\n${WEAR_SERIAL} device model:Wear\n`,
        stderr: ''
      };
    }
    if (joined.includes('ro.kernel.qemu')) return { status: 0, stdout: '1\n', stderr: '' };
    if (joined.includes('ro.build.characteristics')) {
      return { status: 0, stdout: joined.startsWith(`-s ${WEAR_SERIAL}`) ? 'watch\n' : 'emulator\n', stderr: '' };
    }
    if (joined.includes('ro.product.model')) return { status: 0, stdout: 'Model\n', stderr: '' };
    if (joined.includes('ro.build.version.sdk')) return { status: 0, stdout: '36\n', stderr: '' };
    if (joined.includes('ro.product.cpu.abi')) return { status: 0, stdout: 'x86_64\n', stderr: '' };
    if (joined.includes(`pm path ${APPLICATION_ID}`)) return { status: 0, stdout: '', stderr: '' };
    throw new Error(`Unexpected fake adb command: ${joined}`);
  };
  const targets = await verifyAdbUpgradeTargets(
    { phoneSerial: PHONE_SERIAL, wearSerial: WEAR_SERIAL },
    { adb: 'adb' },
    runner
  );
  assert.deepEqual(targets.map((target) => [target.role, target.apiLevel]), [['phone', 36], ['wear', 36]]);
  await assert.rejects(
    verifyAdbUpgradeTargets(
      { phoneSerial: 'R5CRphysical', wearSerial: WEAR_SERIAL },
      { adb: 'adb' },
      async (request) => {
        if (request.args[0] === 'devices') {
          return { status: 0, stdout: `List of devices attached\nR5CRphysical device\n${WEAR_SERIAL} device\n`, stderr: '' };
        }
        return runner(request);
      }
    ),
    /not emulator-scoped/
  );
});

test('install sequence replaces baseline and candidate without uninstall or app-data clearing', async () => {
  const calls = [];
  const versions = { [PHONE_SERIAL]: 0, [WEAR_SERIAL]: 0 };
  const runner = async (request) => {
    calls.push({ label: request.label, args: request.args });
    const serial = request.args[1];
    if (request.args.includes('install')) {
      versions[serial] = request.args.at(-1).includes('candidate') ? 2 : 1;
      return { status: 0, stdout: 'Success\n', stderr: '' };
    }
    if (request.args.includes('dumpsys')) {
      return { status: 0, stdout: packageDump(versions[serial]), stderr: '' };
    }
    if (request.args.includes('logcat')) return { status: 0, stdout: '', stderr: '' };
    if (request.args.includes('pidof')) return { status: 0, stdout: '1234\n', stderr: '' };
    if (request.args.includes('am')) return { status: 0, stdout: 'Status: ok\n', stderr: '' };
    throw new Error(`Unexpected command: ${request.args.join(' ')}`);
  };
  let pausedAfterBaseline = false;
  const result = await executeUpgradeInstallSequence({
    config: { baselineVersionCode: 1, candidateVersionCode: 2 },
    targets: [
      { role: 'phone', serial: PHONE_SERIAL, installedPackagePath: '/data/app/phone/base.apk' },
      { role: 'wear', serial: WEAR_SERIAL, installedPackagePath: '/data/app/wear/base.apk' }
    ],
    artifacts: {
      baseline: { phone: { file: 'baseline-phone.apk' }, wear: { file: 'baseline-wear.apk' } },
      candidate: { phone: { file: 'candidate-phone.apk' }, wear: { file: 'candidate-wear.apk' } }
    },
    tooling: { adb: 'adb' },
    runner,
    pauseForBaselineState: async ({ baselineStates }) => {
      assert.equal(baselineStates.phone.versionCode, 1);
      assert.equal(baselineStates.wear.versionCode, 1);
      pausedAfterBaseline = true;
    },
    verifyPostUpgradeState: async () => ({ mode: 'operator-confirmed', confirmations: { all: true } }),
    delay: async () => {}
  });
  assert.equal(pausedAfterBaseline, true);
  assert.equal(result.candidateStates.phone.firstInstallTime, result.baselineStates.phone.firstInstallTime);
  const joinedCalls = calls.map((call) => call.args.join(' '));
  assert.equal(joinedCalls.some((command) => /\buninstall\b/.test(command)), false);
  assert.equal(joinedCalls.some((command) => /pm clear/.test(command)), false);
  const installs = joinedCalls.filter((command) => command.includes(' install '));
  assert.equal(installs.length, 4);
  assert.equal(installs.every((command) => command.includes(' install -r ')), true);
  assert.equal(joinedCalls.filter((command) => command.includes('logcat -b crash -c')).length, 2);
});

test('install sequence rejects changed firstInstallTime as destructive replacement evidence', async () => {
  const versions = { [PHONE_SERIAL]: 0, [WEAR_SERIAL]: 0 };
  const runner = async (request) => {
    const serial = request.args[1];
    if (request.args.includes('install')) {
      versions[serial] = request.args.at(-1).includes('candidate') ? 2 : 1;
      return { status: 0, stdout: 'Success\n', stderr: '' };
    }
    if (request.args.includes('dumpsys')) {
      const firstInstall = versions[serial] === 2 ? '2026-07-13 11:00:00' : '2026-07-13 10:00:00';
      return { status: 0, stdout: packageDump(versions[serial], firstInstall), stderr: '' };
    }
    if (request.args.includes('am')) return { status: 0, stdout: 'Status: ok\n', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  await assert.rejects(
    executeUpgradeInstallSequence({
      config: { baselineVersionCode: 1, candidateVersionCode: 2 },
      targets: [
        { role: 'phone', serial: PHONE_SERIAL, installedPackagePath: null },
        { role: 'wear', serial: WEAR_SERIAL, installedPackagePath: null }
      ],
      artifacts: {
        baseline: { phone: { file: 'baseline-phone.apk' }, wear: { file: 'baseline-wear.apk' } },
        candidate: { phone: { file: 'candidate-phone.apk' }, wear: { file: 'candidate-wear.apk' } }
      },
      tooling: { adb: 'adb' },
      runner,
      pauseForBaselineState: async () => {},
      delay: async () => {}
    }),
    /firstInstallTime changed/
  );
});

test('package-only execution skips the TTY checkpoint and labels its limited evidence', async () => {
  const versions = { [PHONE_SERIAL]: 0, [WEAR_SERIAL]: 0 };
  let pauseCalls = 0;
  const result = await executeUpgradeInstallSequence({
    config: { baselineVersionCode: 1, candidateVersionCode: 2, packageOnly: true },
    targets: [
      { role: 'phone', serial: PHONE_SERIAL, installedPackagePath: null },
      { role: 'wear', serial: WEAR_SERIAL, installedPackagePath: null }
    ],
    artifacts: {
      baseline: { phone: { file: 'baseline-phone.apk' }, wear: { file: 'baseline-wear.apk' } },
      candidate: { phone: { file: 'candidate-phone.apk' }, wear: { file: 'candidate-wear.apk' } }
    },
    tooling: { adb: 'adb' },
    runner: async (request) => {
      const serial = request.args[1];
      if (request.args.includes('install')) {
        versions[serial] = request.args.at(-1).includes('candidate') ? 2 : 1;
        return { status: 0, stdout: 'Success\n', stderr: '' };
      }
      if (request.args.includes('dumpsys')) {
        return { status: 0, stdout: packageDump(versions[serial]), stderr: '' };
      }
      if (request.args.includes('pidof')) return { status: 0, stdout: '1234\n', stderr: '' };
      if (request.args.includes('am')) return { status: 0, stdout: 'Status: ok\n', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    },
    pauseForBaselineState: async () => { pauseCalls += 1; },
    delay: async () => {}
  });
  assert.equal(pauseCalls, 0);
  assert.deepEqual(result.baselineCheckpoint, { mode: 'package-only', operatorPreparedState: false });
  assert.deepEqual(result.behaviorVerification, { mode: 'not-performed', reason: 'package-only execution' });
  assert.equal(result.crashEvidence.phone.rawLogRetained, false);
});

test('baseline and candidate launches must report Status: ok', async () => {
  const versions = { [PHONE_SERIAL]: 0, [WEAR_SERIAL]: 0 };
  await assert.rejects(
    executeUpgradeInstallSequence({
      config: { baselineVersionCode: 1, candidateVersionCode: 2, packageOnly: true },
      targets: [
        { role: 'phone', serial: PHONE_SERIAL, installedPackagePath: null },
        { role: 'wear', serial: WEAR_SERIAL, installedPackagePath: null }
      ],
      artifacts: {
        baseline: { phone: { file: 'baseline-phone.apk' }, wear: { file: 'baseline-wear.apk' } },
        candidate: { phone: { file: 'candidate-phone.apk' }, wear: { file: 'candidate-wear.apk' } }
      },
      tooling: { adb: 'adb' },
      runner: async (request) => {
        const serial = request.args[1];
        if (request.args.includes('install')) {
          versions[serial] = 1;
          return { status: 0, stdout: 'Success\n', stderr: '' };
        }
        if (request.args.includes('dumpsys')) {
          return { status: 0, stdout: packageDump(versions[serial]), stderr: '' };
        }
        if (request.args.includes('am')) return { status: 0, stdout: 'Status: timeout\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      delay: async () => {}
    }),
    /activity did not report a successful launch/
  );
});

test('dry-run uses an injectable runner and emits only a reviewable plan', async () => {
  const commands = [];
  const commitA = 'a'.repeat(40);
  const commitB = 'b'.repeat(40);
  const runner = async (request) => {
    commands.push(request);
    const joined = request.args.join(' ');
    if (request.command === 'git') {
      return { status: 0, stdout: joined.includes('a99fcb8') ? `${commitA}\n` : `${commitB}\n`, stderr: '' };
    }
    if (joined === 'devices -l') {
      return { status: 0, stdout: `List of devices attached\n${PHONE_SERIAL} device\n${WEAR_SERIAL} device\n`, stderr: '' };
    }
    if (joined.includes('ro.kernel.qemu')) return { status: 0, stdout: '1\n', stderr: '' };
    if (joined.includes('ro.build.characteristics')) {
      return { status: 0, stdout: joined.startsWith(`-s ${WEAR_SERIAL}`) ? 'emulator,watch\n' : 'emulator\n', stderr: '' };
    }
    if (joined.includes('ro.product.model')) return { status: 0, stdout: 'Model\n', stderr: '' };
    if (joined.includes('ro.build.version.sdk')) return { status: 0, stdout: '36\n', stderr: '' };
    if (joined.includes('ro.product.cpu.abi')) return { status: 0, stdout: 'x86_64\n', stderr: '' };
    if (joined.includes(`pm path ${APPLICATION_ID}`)) {
      return { status: 0, stdout: joined.startsWith(`-s ${PHONE_SERIAL}`) ? 'package:/data/app/base.apk\n' : '', stderr: '' };
    }
    throw new Error(`Unexpected dry-run command: ${request.command} ${joined}`);
  };
  const config = parseNativeUpgradeArgs(validArgs());
  const result = await runNativeUpgradeRehearsal(config, {
    runner,
    repositoryRoot: path.resolve('.'),
    tooling: resolveNativeUpgradeTooling(process.env)
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.baseline.commit, commitA);
  assert.equal(result.plan.candidate.commit, commitB);
  assert.equal(result.warnings.length, 1);
  assert.equal(commands.some((request) => request.args.includes('clone')), false);
  assert.equal(commands.some((request) => request.args.includes('install')), false);
});

test('temp cleanup refuses any path that is not the exact run-owned root', () => {
  assert.throws(
    () => removeOwnedTempRoot(path.join(process.cwd(), 'not-owned'), 'example'),
    /Refusing to remove unexpected temp path/
  );
});
