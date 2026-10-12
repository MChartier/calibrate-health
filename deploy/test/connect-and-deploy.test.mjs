/**
 * @file Verify webhook completion, credential handling, private routing, and
 * runner cleanup with mocked commands; no homelab or WireGuard host is changed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { connectAndDeploy, deploymentInputs } from '../scripts/connect-and-deploy.mjs';

const runnerEnvironment = {
  DEPLOY_HOST: '10.8.0.1', DEPLOY_WG_ADDRESS: '10.8.0.20',
  DEPLOY_WG_ENDPOINT: 'vpn.example.test:51820',
  DEPLOY_WG_PUBLIC_KEY: `${'a'.repeat(43)}=`, DEPLOY_WG_PRIVATE_KEY: `${'b'.repeat(43)}=`,
  DEPLOY_URL: 'https://deploy.example.test/deploy/calibratehealth', DEPLOY_TOKEN: 'c'.repeat(43),
};
const success = JSON.stringify({ service: 'calibratehealth', status: 'succeeded', healthy: true });

/** Capture runner commands and simulate a webhook result or failure at a selected stage. */
function fixture(t, { response = `${success}\n200`, failure } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-webhook-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = { ...runnerEnvironment, GITHUB_STEP_SUMMARY: path.join(directory, 'summary') };
  const calls = [];
  let keyPath;
  /** Model only ephemeral runner networking and HTTP, rejecting any host configuration or SSH command. */
  const run = (binary, args, options) => {
    calls.push({ binary, args, options });
    assert.ok(['sudo', 'curl'].includes(binary), binary);
    if (binary === 'sudo') assert.ok(['ip', 'wg'].includes(args[0]));
    if (args[0] === 'wg') {
      keyPath = args[args.indexOf('private-key') + 1];
      assert.equal(fs.readFileSync(keyPath, 'utf8'), `${env.DEPLOY_WG_PRIVATE_KEY}\n`);
      assert.equal(args[args.indexOf('allowed-ips') + 1], `${env.DEPLOY_HOST}/32`);
      if (process.platform !== 'win32') assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
    }
    if ((failure === 'create' && args.includes('add') && args.includes('link'))
      || (failure === 'wg' && args[0] === 'wg')
      || (failure === 'cleanup' && args.includes('delete'))
      || (failure === 'request' && binary === 'curl')) {
      throw new Error(`Simulated failure containing private diagnostics ${env.DEPLOY_TOKEN}`);
    }
    return binary === 'curl' ? response : '';
  };
  return { env, calls, run: () => connectAndDeploy(env, run), keyDirectory: () => path.dirname(keyPath) };
}

test('runner rejects malformed configuration before creating a tunnel', () => {
  assert.equal(deploymentInputs(runnerEnvironment).href, runnerEnvironment.DEPLOY_URL);
  for (const override of [
    { DEPLOY_HOST: '0.0.0.0/0' }, { DEPLOY_HOST: '-oProxyCommand=id' },
    { DEPLOY_WG_ADDRESS: '10.8.0.1' }, { DEPLOY_WG_ENDPOINT: 'vpn.example.test:99999' },
    { DEPLOY_WG_PRIVATE_KEY: '' }, { DEPLOY_WG_PUBLIC_KEY: 'bad-key' },
    { DEPLOY_TOKEN: '' }, { DEPLOY_TOKEN: `${runnerEnvironment.DEPLOY_TOKEN}\nheader = "other"` },
    { DEPLOY_URL: '' }, { DEPLOY_URL: 'http://deploy.example.test/deploy/calibratehealth' },
    { DEPLOY_URL: 'https://token@deploy.example.test/deploy/calibratehealth' },
    { DEPLOY_URL: 'https://deploy.example.test/deploy/little-say' },
    { DEPLOY_URL: `${runnerEnvironment.DEPLOY_URL}?image=other` },
    { DEPLOY_URL: `${runnerEnvironment.DEPLOY_URL}#fragment` },
    { DEPLOY_URL: 'https://10.8.0.2/deploy/calibratehealth' },
  ]) {
    assert.throws(() => connectAndDeploy({ ...runnerEnvironment, ...override }, () => assert.fail('must not execute')));
  }
});

test('runner sends one bodyless authenticated HTTPS POST over the private route and requires health', (t) => {
  const f = fixture(t);
  f.run();
  const requests = f.calls.filter(({ binary }) => binary === 'curl');
  assert.equal(requests.length, 1);
  const { args, options } = requests[0];
  assert.equal(args[0], '--disable');
  assert.equal(args[args.indexOf('--request') + 1], 'POST');
  assert.equal(args[args.indexOf('--url') + 1], f.env.DEPLOY_URL);
  assert.equal(args[args.indexOf('--resolve') + 1], 'deploy.example.test:443:10.8.0.1');
  assert.equal(args[args.indexOf('--proto') + 1], '=https');
  assert.equal(args[args.indexOf('--noproxy') + 1], '*');
  assert.equal(args[args.indexOf('--retry') + 1], '0');
  assert.equal(args[args.indexOf('--max-time') + 1], '780');
  assert.equal(args[args.indexOf('--connect-timeout') + 1], '15');
  assert.equal(args[args.indexOf('--config') + 1], '-');
  assert.equal(args[args.indexOf('--write-out') + 1], '\n%{http_code}');
  assert.ok(!args.some((arg) => ['--location', '--insecure', '--data', '--data-binary'].includes(arg)));
  assert.ok(!args.some((arg) => arg.includes(f.env.DEPLOY_TOKEN) || arg.includes(f.env.DEPLOY_WG_PRIVATE_KEY)));
  assert.equal(options.input, `header = "Authorization: Bearer ${f.env.DEPLOY_TOKEN}"\n`);
  assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
  assert.equal(options.timeout, 790000);
  assert.equal(options.maxBuffer, 65536);
  assert.deepEqual(f.calls.find(({ args: command }) => command[0] === 'ip' && command[1] === 'route').args,
    ['ip', 'route', 'add', '10.8.0.1/32', 'dev', 'calibrate-ci']);
  assert.deepEqual(f.calls.at(-1).args, ['ip', 'link', 'delete', 'calibrate-ci']);
  assert.equal(fs.existsSync(f.keyDirectory()), false);
  assert.match(fs.readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'), /confirmed Calibrate deployment and application health/);
});

for (const [name, response] of [
  ['unauthorized', `${success}\n401`], ['unsupported service', `${success}\n404`],
  ['already deploying', `${success}\n409`], ['deployment failure', `${success}\n502`],
  ['server timeout', `${success}\n504`], ['redirect', `${success}\n302`],
  ['accepted but pending', `${success}\n202`], ['empty result', '\n200'],
  ['invalid JSON', 'not JSON\n200'], ['truncated response', success], ['null result', 'null\n200'],
  ['wrong service', `${JSON.stringify({ service: 'little-say', status: 'succeeded', healthy: true })}\n200`],
  ['missing health', `${JSON.stringify({ service: 'calibratehealth', status: 'succeeded' })}\n200`],
  ['unhealthy', `${JSON.stringify({ service: 'calibratehealth', status: 'succeeded', healthy: false })}\n200`],
  ['string health', `${JSON.stringify({ service: 'calibratehealth', status: 'succeeded', healthy: 'true' })}\n200`],
  ['failed status', `${JSON.stringify({ service: 'calibratehealth', status: 'failed', healthy: true })}\n200`],
]) {
  test(`runner fails closed, never retries, and removes tunnel/key for ${name}`, (t) => {
    const f = fixture(t, { response });
    assert.throws(f.run, /Deployment failed or health was not confirmed/);
    assert.equal(f.calls.filter(({ binary }) => binary === 'curl').length, 1);
    assert.deepEqual(f.calls.at(-1).args, ['ip', 'link', 'delete', 'calibrate-ci']);
    assert.equal(fs.existsSync(f.keyDirectory()), false);
    assert.equal(fs.existsSync(f.env.GITHUB_STEP_SUMMARY), false);
  });
}

for (const failure of ['wg', 'request']) {
  test(`runner cleans up and hides diagnostics after ${failure} failure or timeout`, (t) => {
    const f = fixture(t, { failure });
    assert.throws(f.run, (error) => {
      assert.match(error.message, /homelab deployment logs before retrying/);
      assert.ok(!error.message.includes(f.env.DEPLOY_TOKEN));
      return true;
    });
    assert.equal(f.calls.filter(({ binary }) => binary === 'curl').length, failure === 'request' ? 1 : 0);
    assert.deepEqual(f.calls.at(-1).args, ['ip', 'link', 'delete', 'calibrate-ci']);
    assert.equal(fs.existsSync(f.keyDirectory()), false);
    assert.equal(fs.existsSync(f.env.GITHUB_STEP_SUMMARY), false);
  });
}

test('a failed tunnel creation never deletes an existing interface or calls the webhook', (t) => {
  const f = fixture(t, { failure: 'create' });
  assert.throws(f.run, /Deployment failed/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, ['ip', 'link', 'add', 'dev', 'calibrate-ci', 'type', 'wireguard']);
});

test('runner removes its key even if tunnel cleanup fails', (t) => {
  const f = fixture(t, { failure: 'cleanup' });
  assert.throws(f.run);
  assert.equal(fs.existsSync(f.keyDirectory()), false);
});
