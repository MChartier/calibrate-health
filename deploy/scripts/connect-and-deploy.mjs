/**
 * @file Connect a hosted Actions runner using an existing WireGuard peer, call
 * the homelab deployment webhook, and require completed deployment and health.
 * Only the runner's temporary tunnel and credentials are configured here.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { isIPv4 } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INTERFACE = 'calibrate-ci';
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
// Allow the homelab's bounded pull/start/health sequence to finish before the runner times out.
const REQUEST_TIMEOUT_SECONDS = 780;

/** Validate the existing peer credentials and bodyless Calibrate HTTPS endpoint before opening a tunnel. */
export function deploymentInputs(env) {
  for (const key of ['DEPLOY_HOST', 'DEPLOY_WG_ADDRESS']) {
    if (!isIPv4(env[key] || '')) throw new Error(`${key} must be a single IPv4 address.`);
  }
  if (env.DEPLOY_HOST === env.DEPLOY_WG_ADDRESS) throw new Error('Use separate server and CI peer addresses.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*:[0-9]{1,5}$/.test(env.DEPLOY_WG_ENDPOINT || '')) {
    throw new Error('DEPLOY_WG_ENDPOINT must be a reachable hostname/IPv4 and UDP port.');
  }
  const port = Number(env.DEPLOY_WG_ENDPOINT.split(':')[1]);
  if (port < 1 || port > 65535) throw new Error('Invalid WireGuard endpoint port.');
  for (const key of ['DEPLOY_WG_PRIVATE_KEY', 'DEPLOY_WG_PUBLIC_KEY']) {
    if (!KEY_PATTERN.test(env[key] || '')) throw new Error(`Set ${key} to one WireGuard key.`);
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(env.DEPLOY_TOKEN || '')) {
    throw new Error('Set DEPLOY_TOKEN to the application-specific base64url token from the homelab service.');
  }
  let url;
  try { url = new URL(env.DEPLOY_URL); } catch { throw new Error('Set DEPLOY_URL to the Calibrate HTTPS deployment endpoint.'); }
  if (url.protocol !== 'https:' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/deploy/calibratehealth'
    || (isIPv4(url.hostname) && url.hostname !== env.DEPLOY_HOST)) {
    throw new Error('DEPLOY_URL must be HTTPS with path /deploy/calibratehealth and no credentials, query, or fragment.');
  }
  return url;
}

/** Require HTTP 200 and the service's completed, affirmative health result; never print response bodies. */
function verifyDeploymentResponse(output) {
  const boundary = output.lastIndexOf('\n');
  if (boundary < 0 || output.slice(boundary + 1) !== '200') throw new Error('Unsuccessful webhook HTTP status.');
  const result = JSON.parse(output.slice(0, boundary));
  if (result?.service !== 'calibratehealth' || result.status !== 'succeeded' || result.healthy !== true) {
    throw new Error('The webhook did not confirm a healthy Calibrate deployment.');
  }
}

/** POST once over the private route, then clean up the runner tunnel and key on success or failure. */
export function connectAndDeploy(env = process.env, run = execFileSync) {
  const url = deploymentInputs(env);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-deploy-'));
  const wireguardKey = path.join(directory, 'wireguard.key');
  /** Bound subprocess execution and withhold private diagnostics unless explicitly overridden. */
  const command = (binary, args, options = {}) => run(binary, args, {
    stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000, ...options,
  });
  let tunnelCreated = false;
  try {
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(wireguardKey, `${env.DEPLOY_WG_PRIVATE_KEY}\n`, { mode: 0o600 });
    command('sudo', ['ip', 'link', 'add', 'dev', INTERFACE, 'type', 'wireguard']);
    tunnelCreated = true;
    command('sudo', ['ip', 'address', 'add', `${env.DEPLOY_WG_ADDRESS}/32`, 'dev', INTERFACE]);
    command('sudo', ['wg', 'set', INTERFACE, 'private-key', wireguardKey, 'peer', env.DEPLOY_WG_PUBLIC_KEY,
      'allowed-ips', `${env.DEPLOY_HOST}/32`, 'endpoint', env.DEPLOY_WG_ENDPOINT, 'persistent-keepalive', '25']);
    command('sudo', ['ip', 'link', 'set', 'dev', INTERFACE, 'mtu', '1420', 'up']);
    command('sudo', ['ip', 'route', 'add', `${env.DEPLOY_HOST}/32`, 'dev', INTERFACE]);
    // Pin only this request to the private destination, preserving HTTPS hostname verification.
    // Disable curlrc/proxies/redirects/retries; the token goes through stdin, never command arguments.
    const response = command('curl', ['--disable', '--silent', '--show-error', '--proto', '=https',
      '--noproxy', '*', '--request', 'POST', '--connect-timeout', '15',
      '--max-time', String(REQUEST_TIMEOUT_SECONDS), '--retry', '0',
      '--resolve', `${url.hostname}:${url.port || '443'}:${env.DEPLOY_HOST}`,
      '--config', '-', '--url', url.href, '--write-out', '\n%{http_code}'], {
      input: `header = "Authorization: Bearer ${env.DEPLOY_TOKEN}"\n`,
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024,
      timeout: (REQUEST_TIMEOUT_SECONDS + 10) * 1000,
    });
    verifyDeploymentResponse(response);
    if (env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, 'Homelab webhook confirmed Calibrate deployment and application health.\n');
    }
  } catch {
    throw new Error('Deployment failed or health was not confirmed. Check WireGuard configuration and homelab deployment logs before retrying; a timed-out request may still be deploying.');
  } finally {
    try {
      if (tunnelCreated) command('sudo', ['ip', 'link', 'delete', INTERFACE]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    connectAndDeploy();
  } catch (error) {
    console.error(`[deploy] ${error.message}`);
    process.exitCode = 1;
  }
}
