/**
 * @file Configure restricted SSH and a CI WireGuard peer on an existing Debian
 * Compose host. Confirm and record mutations, reuse installed assets on reruns,
 * and print the protected GitHub environment values after successful setup.
 */
import fs from 'node:fs';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { deploymentInputs } from './connect-and-deploy.mjs';
import { validateConfig } from './self-hosted-deploy.mjs';
import { ACCOUNT, ACCOUNT_HOME, command,
  HostChanges, SSH_FILE, withConfirmation } from './self-hosted-setup-state.mjs';

const CONFIG = '/etc/calibrate/setup.json';
const EXPORT = '/etc/calibrate/github-environment.json';
const BEGIN_PEER = '# BEGIN calibrate CI peer';
const END_PEER = '# END calibrate CI peer';
const MARKER = '# Managed by calibrate deployment setup';
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/** Validate stack and network settings before inspecting or changing the host. */
export function validateSetup(config) {
  validateConfig(config.deployment);
  if (!/^[a-zA-Z0-9_-]{1,15}$/.test(config.interface || '')) throw new Error('Invalid WireGuard interface name.');
  deploymentInputs({
    DEPLOY_HOST: config.host, DEPLOY_WG_ADDRESS: config.peerAddress,
    DEPLOY_WG_ENDPOINT: config.endpoint, DEPLOY_SSH_USER: ACCOUNT,
    DEPLOY_WG_PRIVATE_KEY: 'a'.repeat(43) + '=', DEPLOY_WG_PUBLIC_KEY: 'b'.repeat(43) + '=',
    DEPLOY_SSH_PRIVATE_KEY: 'validated separately', DEPLOY_SSH_KNOWN_HOSTS: 'validated separately',
  });
}

/** Convert a validated IPv4 address to an unsigned number for subnet comparisons. */
function ipv4Number(value) {
  return value.split('.').reduce((number, octet) => number * 256 + Number(octet), 0);
}

/** Reject a CI address covered by another WireGuard peer's IPv4 routes. */
export function assertUnusedAddress(address, allowedIps) {
  for (const cidr of allowedIps.split(/[\s,]+/).filter(Boolean)) {
    const [ip, prefix = '32'] = cidr.split('/');
    if (!isIPv4(ip)) continue;
    const bits = Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('Invalid existing WireGuard AllowedIPs.');
    const size = 2 ** (32 - bits);
    if (Math.floor(ipv4Number(address) / size) === Math.floor(ipv4Number(ip) / size)) {
      throw new Error(`CI address ${address} overlaps an existing WireGuard peer (${cidr}). Choose an unused address.`);
    }
  }
}

/** Reuse the matching CI peer or append it once, rejecting conflicting keys and address ranges. */
export function updateWireGuard(source, publicKey, address) {
  if (!KEY_PATTERN.test(publicKey) || !isIPv4(address)) throw new Error('Invalid CI peer identity.');
  const start = source.indexOf(BEGIN_PEER);
  const end = source.indexOf(END_PEER);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start
    || source.indexOf(BEGIN_PEER, start + 1) >= 0 || source.indexOf(END_PEER, end + 1) >= 0))) {
    throw new Error('Malformed managed WireGuard peer block; inspect it before rerunning setup.');
  }
  if (start >= 0) {
    const previous = source.slice(start, end);
    if (previous.match(/^\s*PublicKey\s*=\s*(\S+)/m)?.[1] !== publicKey) {
      throw new Error('Existing CI peer has a different key. Restore the original setup keys instead of rotating implicitly.');
    }
  }
  if (!/^\s*\[Interface\]\s*$/m.test(source)) throw new Error('Expected an existing wg-quick configuration.');
  let savedPeer = false;
  for (const section of source.split(/^\s*\[Peer\]\s*$/m).slice(1)) {
    const allowed = [...section.matchAll(/^\s*AllowedIPs\s*=\s*([^#\r\n]+)/gm)]
      .map((match) => match[1].trim()).join(',');
    if (section.match(/^\s*PublicKey\s*=\s*(\S+)/m)?.[1] === publicKey) {
      // wg-quick SaveConfig rewrites peer blocks without comments when the interface stops.
      if (savedPeer || allowed !== `${address}/32`) throw new Error('Existing CI peer has unexpected AllowedIPs or duplicates.');
      savedPeer = true;
      continue;
    }
    assertUnusedAddress(address, allowed);
  }
  if (savedPeer) return source;
  return `${source.trimEnd()}\n\n${BEGIN_PEER}\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${address}/32\n${END_PEER}\n`;
}

/** Remove only the recorded peer, including configurations rewritten by wg-quick SaveConfig. */
export function removeWireGuardPeer(source, publicKey) {
  const sections = [...source.matchAll(/^[ \t]*\[Peer\][ \t]*\r?$/gmi)];
  const matches = sections.map((match, index) => ({ start: match.index,
    end: sections[index + 1]?.index ?? source.length }))
    .filter(({ start, end }) => source.slice(start, end).match(/^\s*PublicKey\s*=\s*(\S+)/mi)?.[1] === publicKey);
  if (matches.length > 1) throw new Error('Duplicate CI peer keys in WireGuard configuration; reconcile before uninstall.');
  if (!matches.length) return source;
  let { start, end } = matches[0];
  const marker = source.lastIndexOf(BEGIN_PEER, start);
  if (marker >= 0 && !source.slice(marker + BEGIN_PEER.length, start).trim()) {
    const closing = source.indexOf(END_PEER, start);
    if (closing < 0 || closing >= end) throw new Error('Malformed managed WireGuard peer block.');
    start = marker;
    end = closing + END_PEER.length;
    if (source[end] === '\r') end++;
    if (source[end] === '\n') end++;
  }
  return source.slice(0, start).replace(/\n\n$/, '\n') + source.slice(end);
}

/** Build a per-account SSH policy that forces the deployment command and disables interactive access. */
function sshConfiguration() {
  return `${MARKER}
Match User ${ACCOUNT}
    AuthorizedKeysFile /etc/ssh/authorized_keys/${ACCOUNT}
    AuthorizedKeysCommand none
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    ForceCommand /usr/bin/sudo -n /usr/local/sbin/calibrate-deploy
    DisableForwarding yes
    PermitTTY no
    PermitUserRC no
    PermitTunnel no
Match all
`;
}

/** Fail if effective sshd settings override any required restriction for the deployment account. */
export function verifySshConfiguration(output) {
  const values = Object.fromEntries(output.split('\n').map((line) => {
    const separator = line.indexOf(' ');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  for (const [name, value] of Object.entries({
    authorizedkeysfile: `/etc/ssh/authorized_keys/${ACCOUNT}`, authorizedkeyscommand: 'none',
    authenticationmethods: 'publickey', passwordauthentication: 'no', kbdinteractiveauthentication: 'no',
    forcecommand: '/usr/bin/sudo -n /usr/local/sbin/calibrate-deploy', disableforwarding: 'yes',
    permittty: 'no', permituserrc: 'no', permittunnel: 'no',
  })) {
    if (values[name] !== value) throw new Error(`Existing sshd settings override ${name} for ${ACCOUNT}. Reconcile the SSH configuration.`);
  }
  if (!values.port?.split(/\s+/).includes('22')) throw new Error('This deployment workflow requires SSH on port 22.');
}

/** Print saved CI credentials and the master-only environment policy for the administrator to copy. */
function printGithubValues(values, log = console.log) {
  log(`Copy into the ${values.environment} GitHub environment. This output contains private CI keys.`);
  log(`Deployment branches and tags: Selected branches and tags; allow only branch ${values.branch}, with no tags.`);
  for (const kind of ['variables', 'secrets']) {
    for (const [key, value] of Object.entries(values[kind])) {
      log(`\n${kind === 'secrets' ? 'SECRET' : 'VARIABLE'} ${key}\n${value}`);
    }
  }
}

/** Reconcile host assets with per-change confirmation and recovery records; never upgrade the application. */
export async function install(config, options = {}) {
  const host = new HostChanges(options);
  const { run, log } = host;
  log('[check] Validating the existing Compose stack, WireGuard interface, and host prerequisites.');
  validateSetup(config);
  const wgFile = `/etc/wireguard/${config.interface}.conf`;
  const wgService = `wg-quick@${config.interface}.service`;
  const saved = host.exists(CONFIG) ? JSON.parse(host.read(CONFIG)) : null;
  if (saved && (saved.interface !== config.interface || saved.peerAddress !== config.peerAddress || saved.host !== config.host)) {
    throw new Error('Reuse the installed interface and CI addresses. Network/key migration is a separate administrator operation.');
  }
  for (const binary of ['/usr/bin/node', '/usr/bin/ssh-keygen', '/usr/bin/wg', '/usr/bin/wg-quick',
    '/usr/bin/sudo', '/usr/sbin/sshd', '/usr/sbin/visudo', '/usr/sbin/useradd', '/usr/sbin/usermod', '/usr/sbin/runuser']) {
    if (!host.exists(binary)) throw new Error(`Install the prerequisite ${binary} before setup.`);
  }
  const nodeMajor = Number(run('/usr/bin/node', ['--version']).replace(/^v/, '').split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 22) throw new Error('The installed wrapper requires Node 22+ at /usr/bin/node.');
  run('systemctl', ['is-active', '--quiet', wgService]);
  const addresses = JSON.parse(run('ip', ['-j', '-4', 'address', 'show', 'dev', config.interface]));
  if (!addresses.some((entry) => entry.addr_info?.some((address) => address.local === config.host))) {
    throw new Error('Deployment host must be an IPv4 address assigned to the local WireGuard interface.');
  }
  if (addresses.some((entry) => entry.addr_info?.some((address) => address.local === config.peerAddress))) {
    throw new Error('The CI peer address is already assigned to the server.');
  }
  const routeArgs = ['-j', 'route', 'show', 'exact', `${config.peerAddress}/32`];
  const routes = JSON.parse(run('ip', routeArgs));
  if (routes.some((route) => route.dev !== config.interface)) throw new Error('The CI address already has a route through another interface.');
  host.assertOwned(wgFile);
  const originalWg = host.read(wgFile).replaceAll('\r\n', '\n');
  const serverPublicKey = run('wg', ['show', config.interface, 'public-key']);
  if (!KEY_PATTERN.test(serverPublicKey)) throw new Error('Unable to read the WireGuard server public key.');
  const compose = JSON.parse(run('docker', ['compose', '--project-name', config.deployment.projectName,
    '--project-directory', config.deployment.projectDirectory,
    '--env-file', path.join(config.deployment.projectDirectory, config.deployment.envFile),
    ...config.deployment.composeFiles.flatMap((file) => ['-f', path.join(config.deployment.projectDirectory, file)]),
    'config', '--format', 'json']));
  if (!compose.services?.app?.image?.endsWith(':latest') || !compose.services.app.healthcheck?.test
    || compose.services.app.healthcheck.disable || compose.services.app.healthcheck.test[0] === 'NONE') {
    throw new Error('The existing Compose app must use latest and an enabled application healthcheck.');
  }
  const oldSsh = host.exists(SSH_FILE) ? host.snapshot(SSH_FILE) : null;
  if (oldSsh !== null && !host.read(SSH_FILE).startsWith(MARKER)) throw new Error(`Refusing to replace unmanaged ${SSH_FILE}.`);
  const authorizedKeys = `/etc/ssh/authorized_keys/${ACCOUNT}`;
  if (host.exists(authorizedKeys) && !host.exists('/etc/calibrate/ci-ssh-key')) {
    throw new Error('An SSH deployment key already exists. Install its matching private key at /etc/calibrate/ci-ssh-key (root, mode 0600) before rerunning; setup will not rotate it.');
  }

  await host.initialize();
  const account = run('getent', ['passwd', ACCOUNT], { absent: true, missingCodes: [2] });
  if (account === null) {
    if (run('getent', ['group', ACCOUNT], { absent: true, missingCodes: [2] }) !== null) throw new Error(`Group ${ACCOUNT} already exists without the deployment account.`);
    await host.directory(ACCOUNT_HOME, 0o755);
    await host.change(`Create account and group ${ACCOUNT}, with shell /bin/sh and the empty home ${ACCOUNT_HOME}.`, () => {
      host.remember('account', { created: true, uid: null, gid: null });
      run('useradd', ['--system', '--no-create-home', '--home-dir', ACCOUNT_HOME, '--user-group', '--shell', '/bin/sh', ACCOUNT]);
      const fields = run('getent', ['passwd', ACCOUNT]).split(':');
      Object.assign(host.state.resources.account, { uid: fields[2], gid: fields[3] });
      host.save();
    });
  } else host.skip(`Account ${ACCOUNT}`);
  if (run('id', ['-u', ACCOUNT]) === '0' || run('id', ['-nG', ACCOUNT]) !== ACCOUNT) {
    throw new Error(`${ACCOUNT} must be non-root and belong only to its own group (no Docker or sudo group).`);
  }
  const accountFields = run('getent', ['passwd', ACCOUNT]).split(':');
  if (accountFields[6] !== '/bin/sh') {
    await host.change(`Change ${ACCOUNT}'s login shell to /bin/sh to avoid user-controlled shell startup files.`, () => {
      host.remember('account', { created: false, shell: accountFields[6], uid: accountFields[2], gid: accountFields[3] });
      run('usermod', ['--shell', '/bin/sh', ACCOUNT]);
    });
  } else host.skip('Deployment account shell /bin/sh');
  for (const file of [...config.deployment.composeFiles, config.deployment.envFile]) {
    let candidate = path.join(config.deployment.projectDirectory, file);
    const paths = new Set();
    for (const start of [candidate, fs.realpathSync(candidate)]) {
      candidate = start;
      while (!paths.has(candidate)) {
        paths.add(candidate);
        const parent = path.dirname(candidate);
        if (parent === candidate) break;
        candidate = parent;
      }
    }
    for (const filename of paths) {
      if (run('runuser', ['-u', ACCOUNT, '--', 'test', '-w', filename], { absent: true }) !== null) {
        throw new Error(`The deployment account can write ${filename}. Remove that write access before setup.`);
      }
    }
  }
  for (const [directory, mode, shared] of [
    ['/etc/calibrate', 0o700, false], ['/etc/calibrate/registry', 0o700, false],
    ['/etc/ssh/authorized_keys', 0o755, true], ['/etc/ssh/sshd_config.d', 0o755, true],
    ['/usr/local/lib', 0o755, true], ['/usr/local/sbin', 0o755, true],
  ]) {
    await host.directory(directory, mode, shared);
    if (run('runuser', ['-u', ACCOUNT, '--', 'test', '-w', host.target(directory)], { absent: true }) !== null) {
      throw new Error(`The deployment account must not be able to write ${directory}.`);
    }
  }
  await host.sshKey('/etc/calibrate/ci-ssh-key');
  const sshPublicKey = run('ssh-keygen', ['-y', '-P', '', '-f', host.target('/etc/calibrate/ci-ssh-key')])
    .split(/\s+/).slice(0, 2).join(' ');
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(sshPublicKey)) throw new Error('Expected an unencrypted Ed25519 deployment key.');
  if (host.exists(authorizedKeys) && !host.read(authorizedKeys).includes(sshPublicKey)) {
    throw new Error('The saved CI private key does not match the existing authorized key. Refusing to replace access.');
  }
  await host.wireGuardKey('/etc/calibrate/ci-wireguard.key');
  const wgPrivateKey = host.read('/etc/calibrate/ci-wireguard.key').trim();
  if (!KEY_PATTERN.test(wgPrivateKey)) throw new Error('Invalid saved CI WireGuard key.');
  const wgPublicKey = run('wg', ['pubkey'], { input: `${wgPrivateKey}\n` });
  const updatedWg = updateWireGuard(originalWg, wgPublicKey, config.peerAddress);
  let liveAllowed = null;
  for (const line of run('wg', ['show', config.interface, 'allowed-ips']).split('\n')) {
    const [key, ...allowed] = line.trim().split(/\s+/);
    if (key === wgPublicKey) liveAllowed = allowed.join(' ').replaceAll(',', ' ').trim();
    else assertUnusedAddress(config.peerAddress, allowed.join(' '));
  }
  await host.file(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  await host.file('/etc/calibrate/deploy.json', `${JSON.stringify(config.deployment, null, 2)}\n`);
  await host.file('/usr/local/lib/calibrate-deploy.mjs', fs.readFileSync(path.join(SOURCE_ROOT, 'scripts/self-hosted-deploy.mjs')), 0o644);
  await host.file('/usr/local/sbin/calibrate-deploy', fs.readFileSync(path.join(SOURCE_ROOT, 'self-hosted/calibrate-deploy')), 0o755);
  await host.file(authorizedKeys, `restrict,command="/usr/bin/sudo -n /usr/local/sbin/calibrate-deploy" ${sshPublicKey} calibrate-ci\n`, 0o644);
  await host.file('/etc/sudoers.d/calibrate-deploy', `${ACCOUNT} ALL=(root) NOPASSWD: /usr/local/sbin/calibrate-deploy ""\n`,
    0o440, [], (temporary) => run('visudo', ['-cf', temporary]));
  const sshChanged = await host.file(SSH_FILE, sshConfiguration(), 0o644, ['sshReload']);
  try {
    run('sshd', ['-t']);
    verifySshConfiguration(run('sshd', ['-T', '-C', `user=${ACCOUNT},host=localhost,addr=${config.peerAddress},laddr=${config.host},lport=22`]));
  } catch (error) {
    if (sshChanged) {
      await host.change(`Restore the previous ${SSH_FILE} after failed SSH validation.`, () => {
        if (oldSsh === null) fs.unlinkSync(host.target(SSH_FILE));
        else host.atomicWrite(SSH_FILE, Buffer.from(oldSsh.data, 'base64'), oldSsh.mode);
        delete host.state.pending.sshReload;
        host.save();
      });
    }
    throw error;
  }
  await host.reload('sshReload', 'Reload SSH with the validated deployment account restrictions.', 'systemctl', ['reload', 'ssh']);

  const peer = { interface: config.interface, publicKey: wgPublicKey, address: config.peerAddress,
    configCreated: originalWg !== updatedWg, configMode: fs.statSync(host.target(wgFile)).mode & 0o777,
    liveBefore: liveAllowed };
  if (originalWg !== updatedWg) {
    await host.change(`Add the dedicated CI peer ${config.peerAddress}/32 to ${wgFile}, preserving other peers.`, () => {
      host.remember('peer', peer);
      host.atomicWrite(wgFile, updatedWg, 0o600);
    });
  } else host.skip('Persisted CI WireGuard peer');
  if (liveAllowed !== `${config.peerAddress}/32`) {
    await host.change(`Configure the live CI peer ${config.peerAddress}/32 on ${config.interface}.`, () => {
      host.remember('peer', peer);
      run('wg', ['set', config.interface, 'peer', wgPublicKey, 'allowed-ips', `${config.peerAddress}/32`]);
    });
  } else host.skip('Live CI WireGuard peer');
  if (!routes.length) {
    await host.change(`Add route ${config.peerAddress}/32 through ${config.interface}.`, () => {
      host.remember('route', { interface: config.interface, address: config.peerAddress });
      run('ip', ['route', 'add', `${config.peerAddress}/32`, 'dev', config.interface]);
    });
  } else host.skip('CI WireGuard route');
  const hostKey = host.read('/etc/ssh/ssh_host_ed25519_key.pub').trim().split(/\s+/).slice(0, 2).join(' ');
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(hostKey)) throw new Error('Expected an Ed25519 SSH host public key.');
  const githubValues = {
    environment: 'self-hosted-testing', branch: 'master',
    variables: { DEPLOY_HOST: config.host, DEPLOY_SSH_USER: ACCOUNT,
      DEPLOY_WG_ADDRESS: config.peerAddress, DEPLOY_WG_PUBLIC_KEY: serverPublicKey },
    secrets: { DEPLOY_WG_ENDPOINT: config.endpoint, DEPLOY_WG_PRIVATE_KEY: wgPrivateKey,
      DEPLOY_SSH_PRIVATE_KEY: host.read('/etc/calibrate/ci-ssh-key'), DEPLOY_SSH_KNOWN_HOSTS: `${config.host} ${hostKey}` },
  };
  await host.file(EXPORT, `${JSON.stringify(githubValues, null, 2)}\n`);
  log('Setup complete. Compose and its environment were not changed, and no upgrade was run.');
  log('Upgrade and health check: sudo /usr/local/sbin/calibrate-deploy');
  printGithubValues(githubValues, log);
}

/** Reuse saved settings or ask once for the existing stack, local VPN interface, and CI peer address. */
async function promptConfiguration() {
  if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (!process.stdin.isTTY) throw new Error('First-time setup needs an interactive terminal.');
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  /** Read one configuration value, keeping the suggested value when the administrator presses Enter. */
  const ask = async (label, fallback = '') => (await prompts.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;
  try {
    const existing = fs.existsSync('/etc/calibrate/deploy.json')
      ? JSON.parse(fs.readFileSync('/etc/calibrate/deploy.json', 'utf8')) : {};
    const projectDirectory = await ask('Existing Compose directory', existing.projectDirectory || '/srv/calibrate/deploy');
    const projectName = await ask('Existing Compose project name', existing.projectName || 'calibrate');
    const composeFiles = (await ask('Compose files, comma-separated', existing.composeFiles?.join(',') || 'docker-compose.yml'))
      .split(',').map((file) => file.trim());
    const envFile = await ask('Compose environment file', existing.envFile || '.env');
    const interfaces = command('wg', ['show', 'interfaces']).split(/\s+/).filter(Boolean);
    const iface = await ask('Existing wg-quick interface', interfaces.length === 1 ? interfaces[0] : 'wg0');
    const addresses = JSON.parse(command('ip', ['-j', '-4', 'address', 'show', 'dev', iface]));
    const host = await ask('Server WireGuard IPv4', addresses[0]?.addr_info?.[0]?.local || '');
    const peerAddress = await ask('Unused CI peer IPv4 (no /32 suffix)');
    const endpoint = await ask('Public WireGuard endpoint (hostname:UDP-port)');
    return { interface: iface, host, peerAddress, endpoint,
      deployment: { projectDirectory, projectName, composeFiles, envFile, waitTimeoutSeconds: existing.waitTimeoutSeconds || 300 } };
  } finally {
    prompts.close();
  }
}

/** Enforce Debian/root prerequisites and dispatch interactive setup or read-only credential output. */
async function main() {
  const mode = process.argv[2] || 'install';
  if (mode === '--help') {
    console.log('sudo node deploy/scripts/setup-self-hosted.mjs [install|github-values]\nInstall on Debian with an existing local wg-quick service, confirming each change, then print the GitHub secrets and variables.\nUnchanged assets are reused. github-values only reprints the saved values.');
    return;
  }
  if (process.argv.length > 3 || !['install', 'github-values'].includes(mode)) throw new Error('Expected install or github-values.');
  if (process.platform !== 'linux' || process.getuid?.() !== 0) throw new Error('Run this setup with sudo on the Debian deployment host.');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node 22+ at /usr/bin/node first.');
  if (mode === 'github-values') {
    printGithubValues(JSON.parse(fs.readFileSync(EXPORT, 'utf8')));
    return;
  }
  if (!/^ID=debian$/m.test(fs.readFileSync('/etc/os-release', 'utf8'))) throw new Error('This installer targets Debian with wg-quick.');
  const config = await promptConfiguration();
  await withConfirmation((confirm) => install(config, { confirm }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[setup] ${error.message}`); process.exitCode = 1; });
}
