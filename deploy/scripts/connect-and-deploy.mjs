import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { isIPv4 } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRequest } from './self-hosted-deploy.mjs';

const INTERFACE = 'calibrate-ci';
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export function deploymentInputs(env) {
  const request = validateRequest({ imageRef: env.DEPLOY_IMAGE_REF, releaseTag: env.DEPLOY_RELEASE_TAG },
    env.DEPLOY_IMAGE_REPOSITORY?.toLowerCase());
  for (const key of ['DEPLOY_HOST', 'DEPLOY_WG_ADDRESS']) {
    if (!isIPv4(env[key] || '')) throw new Error(`${key} must be a single IPv4 address.`);
  }
  if (env.DEPLOY_HOST === env.DEPLOY_WG_ADDRESS) throw new Error('Use separate server and CI peer addresses.');
  if (!/^[a-z_][a-z0-9_-]*$/.test(env.DEPLOY_SSH_USER || '')) throw new Error('Set DEPLOY_SSH_USER.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*:[0-9]{1,5}$/.test(env.DEPLOY_WG_ENDPOINT || '')) {
    throw new Error('DEPLOY_WG_ENDPOINT must be a reachable hostname/IPv4 and UDP port.');
  }
  const port = Number(env.DEPLOY_WG_ENDPOINT.split(':')[1]);
  if (port < 1 || port > 65535) throw new Error('Invalid WireGuard endpoint port.');
  for (const key of ['DEPLOY_WG_PRIVATE_KEY', 'DEPLOY_WG_PUBLIC_KEY']) {
    if (!KEY_PATTERN.test(env[key] || '')) throw new Error(`Set ${key} to one WireGuard key.`);
  }
  for (const key of ['DEPLOY_SSH_PRIVATE_KEY', 'DEPLOY_SSH_KNOWN_HOSTS']) {
    if (!env[key]?.trim()) throw new Error(`Set ${key} in the self-hosted-testing environment.`);
  }
  return request;
}

export function connectAndDeploy(env = process.env, run = execFileSync) {
  const request = deploymentInputs(env);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-deploy-'));
  const wireguardKey = path.join(directory, 'wireguard.key');
  const sshKey = path.join(directory, 'id_ed25519');
  const knownHosts = path.join(directory, 'known_hosts');
  const command = (binary, args, options = {}) => run(binary, args, {
    stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000, ...options,
  });
  let tunnelCreated = false;
  try {
    fs.chmodSync(directory, 0o700);
    for (const [filename, value] of [
      [wireguardKey, env.DEPLOY_WG_PRIVATE_KEY],
      [sshKey, env.DEPLOY_SSH_PRIVATE_KEY],
      [knownHosts, env.DEPLOY_SSH_KNOWN_HOSTS],
    ]) fs.writeFileSync(filename, `${value.trim()}\n`, { mode: 0o600 });
    command('sudo', ['ip', 'link', 'add', 'dev', INTERFACE, 'type', 'wireguard']);
    tunnelCreated = true;
    command('sudo', ['ip', 'address', 'add', `${env.DEPLOY_WG_ADDRESS}/32`, 'dev', INTERFACE]);
    command('sudo', ['wg', 'set', INTERFACE, 'private-key', wireguardKey, 'peer', env.DEPLOY_WG_PUBLIC_KEY,
      'allowed-ips', `${env.DEPLOY_HOST}/32`, 'endpoint', env.DEPLOY_WG_ENDPOINT, 'persistent-keepalive', '25']);
    command('sudo', ['ip', 'link', 'set', 'dev', INTERFACE, 'mtu', '1420', 'up']);
    command('sudo', ['ip', 'route', 'add', `${env.DEPLOY_HOST}/32`, 'dev', INTERFACE]);
    command('ssh', ['-F', '/dev/null', '-T', '-i', sshKey,
      '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=15', '-o', 'ConnectionAttempts=3', '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3', `${env.DEPLOY_SSH_USER}@${env.DEPLOY_HOST}`], {
      input: JSON.stringify(request), stdio: ['pipe', 'inherit', 'inherit'], timeout: 12 * 60 * 1000,
    });
    if (env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `Deployed ${request.releaseTag}: \`${request.imageRef}\`\n`);
    }
  } catch {
    throw new Error('Deployment failed. Check environment configuration, peer routing, SSH host key, and host deployment state.');
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
