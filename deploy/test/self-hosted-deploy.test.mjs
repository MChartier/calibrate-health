import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { connectAndDeploy, deploymentInputs } from '../scripts/connect-and-deploy.mjs';
import { deploy, validateRequest } from '../scripts/self-hosted-deploy.mjs';

const repository = 'ghcr.io/mchartier/calibratehealth';
const oldRelease = { imageRef: `${repository}@sha256:${'a'.repeat(64)}`, releaseTag: 'v0.9.0' };
const release = { imageRef: `${repository}@sha256:${'b'.repeat(64)}`, releaseTag: 'v0.10.0' };
const now = Date.parse('2026-09-05T12:00:00Z');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-deploy-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const stateDirectory = path.join(directory, 'state');
  fs.mkdirSync(stateDirectory);
  fs.writeFileSync(path.join(directory, 'compose.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(directory, '.env'), 'SESSION_SECRET=keep-me\nAPP_IMAGE=old-tag\n');
  fs.writeFileSync(path.join(directory, '.last-success'), new Date(now - 1000).toISOString());
  const stateFile = path.join(stateDirectory, 'state.json');
  const imageFile = path.join(stateDirectory, 'image.env');
  const state = { schemaVersion: 1, current: oldRelease, pending: null };
  if (!options.firstRun) fs.writeFileSync(stateFile, JSON.stringify(state));
  const config = {
    imageRepository: repository, projectDirectory: directory, projectName: 'calibrate-existing',
    composeFiles: ['compose.yml'], envFile: '.env', stateDirectory,
    backupMarker: path.join(directory, '.last-success'), backupMaxAgeSeconds: 172800, waitTimeoutSeconds: 300,
  };
  const calls = [];
  let currentImage = 'old-image-id';
  let currentVersion = oldRelease.releaseTag.slice(1);
  const runDocker = (args, cwd) => {
    assert.equal(cwd, directory);
    calls.push(args);
    if (args[0] === 'compose') {
      assert.equal(args[args.indexOf('--project-name') + 1], config.projectName);
      if (args.includes('ps')) {
        if (options.missingContainer && currentImage === 'old-image-id') return '';
        return options.multipleContainers ? `${'c'.repeat(64)}\n${'d'.repeat(64)}` : 'c'.repeat(64);
      }
      if (args.includes('config')) {
        return JSON.stringify({ services: { app: { image: options.hardcodedImage ? oldRelease.imageRef : release.imageRef } } });
      }
      if (args.includes('up')) {
        assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)).pending, release);
        assert.equal(fs.readFileSync(imageFile, 'utf8'), `APP_IMAGE=${release.imageRef}\n`);
        if (options.upFailure) throw new Error('Readiness timeout');
        currentImage = options.wrongImage ? 'wrong-image' : 'new-image-id';
        currentVersion = options.wrongVersion || release.releaseTag.slice(1);
        return '';
      }
    }
    if (args[0] === 'pull') {
      if (options.pullFailure) throw new Error('Registry unavailable');
      return '';
    }
    if (args[0] === 'image' && args[1] === 'inspect') {
      if (args.includes('{{json .RepoDigests}}')) return JSON.stringify([oldRelease.imageRef]);
      return args.at(-1) === oldRelease.imageRef ? 'old-image-id' : 'new-image-id';
    }
    if (args[0] === 'inspect') {
      if (args.includes('{{.Image}}')) return currentImage;
      if (args.includes('{{.State.Health.Status}}')) return options.unhealthy ? 'unhealthy' : 'healthy';
    }
    if (args[0] === 'exec') return currentVersion;
    throw new Error(`Unexpected Docker command: ${args.join(' ')}`);
  };
  return {
    config, calls, stateFile, imageFile,
    run: (request = release) => deploy(request, config, { runDocker, now: () => now, log: () => {} }),
  };
}

test('only the configured image repository, exact digest, and canonical release tag are accepted', () => {
  assert.deepEqual(validateRequest(release, repository), release);
  for (const imageRef of [
    `${repository}:latest`, `${repository}:v0.10.0`, `${repository}@sha256:abc`,
    `${repository}@sha256:${'b'.repeat(64)}@extra`, `ghcr.io/other/calibratehealth@sha256:${'b'.repeat(64)}`,
    `${release.imageRef}\nanything`, `${release.imageRef}; id`,
  ]) assert.throws(() => validateRequest({ ...release, imageRef }, repository));
  for (const releaseTag of ['0.10.0', 'v01.2.3', 'v1.2.3-preview', 'v1.2.3\n', 'v1.2.3; id']) {
    assert.throws(() => validateRequest({ ...release, releaseTag }, repository));
  }
});

test('first deployment adopts the running digest, preserves secrets, and updates only app', (t) => {
  const f = fixture(t, { firstRun: true });
  f.run();
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stateFile)), {
    schemaVersion: 1, previous: oldRelease, current: release, pending: null,
  });
  assert.equal(fs.readFileSync(path.join(f.config.projectDirectory, '.env'), 'utf8'),
    'SESSION_SECRET=keep-me\nAPP_IMAGE=old-tag\n');
  const up = f.calls.find((args) => args.includes('up'));
  assert.deepEqual(up.slice(up.indexOf('up')), [
    'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '300', 'app',
  ]);
  assert.ok(up.includes(f.imageFile));
  assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 1);
  assert.ok(f.calls.some((args) => args[0] === 'exec' && args.at(-1).includes('readyz') && args.at(-1).includes('server_version')));
});

test('repeating a healthy release checks it without pulling or restarting', (t) => {
  const f = fixture(t);
  f.run(oldRelease);
  assert.ok(!f.calls.some((args) => args.includes('up') || args[0] === 'pull'));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stateFile)).current, oldRelease);
  assert.equal(fs.readFileSync(f.imageFile, 'utf8'), `APP_IMAGE=${oldRelease.imageRef}\n`);
});

test('numeric release ordering and digest identity prevent stale jobs and tag rewrites', (t) => {
  const f = fixture(t);
  for (const request of [
    { ...release, releaseTag: 'v0.8.9' },
    { ...release, releaseTag: oldRelease.releaseTag },
  ]) assert.throws(() => f.run(request), /older release|changed digest/);
  assert.ok(!f.calls.some((args) => args[0] === 'pull' || args.includes('up')));
  f.run(); // 0.10 is newer than 0.9, regardless of lexical ordering.
});

test('invalid host configuration and multiple replicas stop before mutation', (t) => {
  const f = fixture(t);
  f.config.composeFiles = ['../compose.yml'];
  assert.throws(() => f.run(), /inside projectDirectory/);
  assert.equal(f.calls.length, 0);
  const multiple = fixture(t, { multipleContainers: true });
  assert.throws(() => multiple.run(), /exactly one/);
});

test('missing, stale, future, and invalid backup markers prevent deployment', (t) => {
  for (const timestamp of [new Date(now - 172801000).toISOString(), new Date(now + 60000).toISOString(), 'bad']) {
    const f = fixture(t);
    fs.writeFileSync(f.config.backupMarker, timestamp);
    assert.throws(() => f.run(), /Backup/);
    assert.ok(!f.calls.some((args) => args[0] === 'pull' || args.includes('up')));
  }
  const missing = fixture(t);
  fs.unlinkSync(missing.config.backupMarker);
  assert.throws(() => missing.run());
  assert.ok(!missing.calls.some((args) => args.includes('up')));
});

test('pull failure preserves deployment state and desired image', (t) => {
  const f = fixture(t, { pullFailure: true });
  fs.writeFileSync(f.imageFile, `APP_IMAGE=${oldRelease.imageRef}\n`);
  const before = fs.readFileSync(f.stateFile, 'utf8');
  assert.throws(() => f.run(), /Registry unavailable/);
  assert.equal(fs.readFileSync(f.stateFile, 'utf8'), before);
  assert.equal(fs.readFileSync(f.imageFile, 'utf8'), `APP_IMAGE=${oldRelease.imageRef}\n`);
  assert.ok(!f.calls.some((args) => args.includes('up')));
});

test('a Compose file ignoring APP_IMAGE cannot restart with the wrong image', (t) => {
  const f = fixture(t, { hardcodedImage: true });
  assert.throws(() => f.run(), /managed APP_IMAGE override/);
  assert.ok(!f.calls.some((args) => args.includes('up')));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stateFile)).pending, release);
});

for (const failure of [{ upFailure: true }, { wrongImage: true }, { wrongVersion: '99.0.0' }, { unhealthy: true }]) {
  test(`failed deployment retains pending identity without rollback: ${JSON.stringify(failure)}`, (t) => {
    const f = fixture(t, failure);
    assert.throws(() => f.run(), /no automatic image or database rollback/);
    const state = JSON.parse(fs.readFileSync(f.stateFile));
    assert.deepEqual(state.current, oldRelease);
    assert.deepEqual(state.pending, release);
    assert.equal(f.calls.filter((args) => args.includes('up')).length, 1);
    assert.throws(() => f.run({ ...release, releaseTag: 'v0.11.0' }), /previous deployment is incomplete/);
  });
}

test('an interrupted deployment can retry only its exact release and digest', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.stateFile, JSON.stringify({ schemaVersion: 1, current: oldRelease, pending: release }));
  assert.throws(() => f.run(oldRelease), /incomplete/);
  f.run();
  assert.equal(JSON.parse(fs.readFileSync(f.stateFile)).pending, null);
});

test('manual stack drift is detected before overwriting a deployment', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.stateFile, JSON.stringify({ schemaVersion: 1, current: release, pending: null }));
  assert.throws(() => f.run(), /differs from deployment state/);
  assert.ok(!f.calls.some((args) => args[0] === 'pull'));
});

test('pending retries recreate a container removed by an interrupted Compose operation', (t) => {
  const f = fixture(t, { missingContainer: true });
  fs.writeFileSync(f.stateFile, JSON.stringify({ schemaVersion: 1, current: oldRelease, pending: release }));
  f.run();
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stateFile)).current, release);
});

const runnerEnvironment = {
  DEPLOY_IMAGE_REF: release.imageRef, DEPLOY_RELEASE_TAG: release.releaseTag,
  DEPLOY_IMAGE_REPOSITORY: repository, DEPLOY_HOST: '10.8.0.1', DEPLOY_WG_ADDRESS: '10.8.0.20',
  DEPLOY_SSH_USER: 'calibrate-deploy', DEPLOY_WG_ENDPOINT: 'vpn.example.test:51820',
  DEPLOY_WG_PUBLIC_KEY: `${'a'.repeat(43)}=`, DEPLOY_WG_PRIVATE_KEY: `${'b'.repeat(43)}=`,
  DEPLOY_SSH_PRIVATE_KEY: 'test-only-ssh-key', DEPLOY_SSH_KNOWN_HOSTS: '10.8.0.1 ssh-ed25519 test-key',
};

test('runner rejects malformed network configuration before creating any tunnel', () => {
  assert.deepEqual(deploymentInputs(runnerEnvironment), release);
  for (const override of [
    { DEPLOY_HOST: '0.0.0.0/0' }, { DEPLOY_HOST: '-oProxyCommand=id' },
    { DEPLOY_SSH_USER: 'root; id' }, { DEPLOY_WG_ADDRESS: '10.8.0.1' },
    { DEPLOY_WG_ENDPOINT: 'vpn.example.test:99999' }, { DEPLOY_WG_PRIVATE_KEY: '' },
    { DEPLOY_SSH_KNOWN_HOSTS: '' },
  ]) {
    assert.throws(() => connectAndDeploy({ ...runnerEnvironment, ...override }, () => assert.fail('must not execute')));
  }
});

for (const failureStage of [null, 'wg', 'ssh']) {
  test(`runner pins SSH host key, limits routing, and cleans secrets/tunnel: ${failureStage || 'success'}`, () => {
    const calls = [];
    let keyPath;
    const run = (binary, args, options) => {
      calls.push([binary, args, options]);
      if (args[0] === 'wg') {
        keyPath = args[args.indexOf('private-key') + 1];
        assert.equal(fs.readFileSync(keyPath, 'utf8'), `${runnerEnvironment.DEPLOY_WG_PRIVATE_KEY}\n`);
        assert.equal(args[args.indexOf('allowed-ips') + 1], '10.8.0.1/32');
        if (failureStage === 'wg') throw new Error('simulated setup failure');
      }
      if (binary === 'ssh') {
        assert.ok(args.includes('StrictHostKeyChecking=yes'));
        assert.ok(args.includes('BatchMode=yes'));
        assert.equal(args.at(-1), 'calibrate-deploy@10.8.0.1');
        assert.deepEqual(JSON.parse(options.input), release);
        assert.ok(!args.some((arg) => arg.includes('test-only-ssh-key')));
        if (failureStage === 'ssh') throw new Error('simulated network failure');
      }
      return '';
    };
    if (failureStage) assert.throws(() => connectAndDeploy(runnerEnvironment, run), /Deployment failed/);
    else connectAndDeploy(runnerEnvironment, run);
    assert.deepEqual(calls.at(-1).slice(0, 2), ['sudo', ['ip', 'link', 'delete', 'calibrate-ci']]);
    assert.equal(fs.existsSync(path.dirname(keyPath)), false);
  });
}
