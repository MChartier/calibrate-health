/**
 * @file Exercise Compose upgrade health checks and runner tunnel cleanup with
 * temporary stack files and mocked commands; no server or network is contacted.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { connectAndDeploy, deploymentInputs } from '../scripts/connect-and-deploy.mjs';
import { deploy } from '../scripts/self-hosted-deploy.mjs';

/** Build an isolated stack and Docker adapter with selectable pull, startup, and health failures. */
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-deploy-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const composeSource = 'services:\n  app:\n    image: ghcr.io/mchartier/calibratehealth:latest\n';
  const environment = 'SESSION_SECRET=keep-me\nAPP_IMAGE=ghcr.io/mchartier/calibratehealth:latest\n';
  fs.writeFileSync(path.join(directory, 'compose.yml'), composeSource);
  fs.writeFileSync(path.join(directory, '.env'), environment);
  const config = {
    projectDirectory: directory, projectName: 'calibrate-existing',
    composeFiles: ['compose.yml'], envFile: '.env', waitTimeoutSeconds: 300,
  };
  const calls = [];
  const logs = [];
  /** Record and validate stack commands while simulating container lifecycle results. */
  const runDocker = (args, cwd) => {
    assert.equal(cwd, directory);
    calls.push(args);
    if (args[0] === 'compose') {
      assert.equal(args[args.indexOf('--project-name') + 1], config.projectName);
      if (args.includes('pull')) {
        if (options.pullFailure) throw new Error('Registry unavailable');
        return '';
      }
      if (args.includes('up')) {
        if (options.upFailure) throw new Error('Readiness timeout');
        return '';
      }
      if (args.includes('ps')) return options.containerIds ?? 'c'.repeat(64);
    }
    if (args[0] === 'inspect') return options.health ?? 'healthy';
    throw new Error('Unexpected Docker command: ' + args.join(' '));
  };
  return { config, calls, logs, composeSource, environment,
    run: () => deploy(config, { runDocker, log: (message) => logs.push(message) }) };
}

test('upgrades only app from existing Compose files and leaves latest and secrets unchanged', (t) => {
  const f = fixture(t);
  f.run();
  const pull = f.calls.find((args) => args.includes('pull'));
  assert.deepEqual(pull.slice(pull.indexOf('pull')), ['pull', '--policy', 'always', 'app']);
  const up = f.calls.find((args) => args.includes('up'));
  assert.deepEqual(up.slice(up.indexOf('up')), [
    'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '300', 'app',
  ]);
  assert.equal(up.filter((arg) => arg === '--env-file').length, 1);
  assert.equal(fs.readFileSync(path.join(f.config.projectDirectory, 'compose.yml'), 'utf8'), f.composeSource);
  assert.equal(fs.readFileSync(path.join(f.config.projectDirectory, '.env'), 'utf8'), f.environment);
  assert.deepEqual(fs.readdirSync(f.config.projectDirectory).sort(), ['.env', 'compose.yml']);
  assert.equal(f.logs.at(-1), 'Deployment and application health check succeeded.');
});

test('retries repeat the normal upgrade without a deployment state or backup prerequisite', (t) => {
  const f = fixture(t);
  f.run();
  f.run();
  assert.equal(f.calls.filter((args) => args.includes('pull')).length, 2);
  assert.equal(f.calls.filter((args) => args.includes('up')).length, 2);
});

test('pull failure stops before restarting the app', (t) => {
  const f = fixture(t, { pullFailure: true });
  assert.throws(f.run, /Registry unavailable/);
  assert.ok(!f.calls.some((args) => args.includes('up')));
  assert.ok(!f.logs.some((line) => line.includes('succeeded')));
});

for (const options of [
  { upFailure: true }, { health: 'unhealthy' }, { health: 'starting' }, { health: '<no value>' },
  { containerIds: '' }, { containerIds: 'c'.repeat(64) + '\n' + 'd'.repeat(64) },
]) {
  test('failed startup or missing affirmative health fails deployment: ' + JSON.stringify(options), (t) => {
    const f = fixture(t, options);
    assert.throws(f.run, /Readiness timeout|health check|exactly one/);
    assert.equal(f.calls.filter((args) => args.includes('up')).length, 1);
    assert.ok(!f.logs.some((line) => line.includes('succeeded')));
  });
}

test('invalid host configuration fails before Docker commands', (t) => {
  for (const override of [
    { composeFiles: ['../compose.yml'] }, { composeFiles: [] }, { envFile: '../.env' },
    { projectDirectory: 'relative' }, { projectName: '--other' },
    { waitTimeoutSeconds: 0 }, { waitTimeoutSeconds: 481 },
  ]) {
    const f = fixture(t);
    Object.assign(f.config, override);
    assert.throws(f.run);
    assert.equal(f.calls.length, 0);
  }
});

const runnerEnvironment = {
  DEPLOY_HOST: '10.8.0.1', DEPLOY_WG_ADDRESS: '10.8.0.20',
  DEPLOY_SSH_USER: 'calibrate-deploy', DEPLOY_WG_ENDPOINT: 'vpn.example.test:51820',
  DEPLOY_WG_PUBLIC_KEY: `${'a'.repeat(43)}=`, DEPLOY_WG_PRIVATE_KEY: `${'b'.repeat(43)}=`,
  DEPLOY_SSH_PRIVATE_KEY: 'test-only-ssh-key', DEPLOY_SSH_KNOWN_HOSTS: '10.8.0.1 ssh-ed25519 test-key',
};

test('runner rejects malformed network configuration before creating any tunnel', () => {
  assert.doesNotThrow(() => deploymentInputs(runnerEnvironment));
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
    /** Check tunnel and SSH arguments while injecting failures to exercise credential cleanup. */
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
        assert.equal(options.input, undefined);
        assert.ok(args.includes('-n'));
        assert.equal(options.stdio[0], 'ignore');
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
