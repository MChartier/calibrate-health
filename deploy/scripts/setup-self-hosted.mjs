import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { deploymentInputs } from './connect-and-deploy.mjs';
import { validateConfig } from './self-hosted-deploy.mjs';

const ACCOUNT = 'calibrate-deploy';
const CONFIG = '/etc/calibrate/setup.json';
const EXPORT = '/etc/calibrate/github-environment.json';
const BEGIN_PEER = '# BEGIN calibrate CI peer';
const END_PEER = '# END calibrate CI peer';
const MARKER = '# Managed by calibrate deployment setup';
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

function command(binary, args, { input, absent = false } = {}) {
  try {
    return execFileSync(binary, args, {
      input, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_CONFIG: '/etc/calibrate/registry' },
    }).trim();
  } catch (error) {
    if (absent && error.status === 1) return null;
    // WireGuard, Compose, and key-tool diagnostics can include private configuration.
    throw new Error(`${binary} ${args[0]} failed. Inspect that service locally; private command output was withheld.`);
  }
}

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

function ipv4Number(value) {
  return value.split('.').reduce((number, octet) => number * 256 + Number(octet), 0);
}

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
    if (!previous.includes(`PublicKey = ${publicKey}\n`)) {
      throw new Error('Existing CI peer has a different key. Restore the original setup keys instead of rotating implicitly.');
    }
    source = source.slice(0, start) + source.slice(end + END_PEER.length).replace(/^\r?\n/, '');
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

export function firewallRules(config) {
  // This dedicated table adds restrictions without flushing Docker or the existing host firewall.
  return `${MARKER}
add table inet calibrate_ci
flush table inet calibrate_ci
table inet calibrate_ci {
  chain input {
    type filter hook input priority -10; policy accept;
    iifname "${config.interface}" ip saddr ${config.peerAddress} ip daddr ${config.host} tcp dport 22 accept
    iifname "${config.interface}" ip saddr ${config.peerAddress} drop
  }
  chain forward {
    type filter hook forward priority -10; policy accept;
    iifname "${config.interface}" ip saddr ${config.peerAddress} drop
  }
}
`;
}

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

function printGithubValues(values, log = console.log) {
  log(`Copy into the ${values.environment} GitHub environment. This output contains private CI keys.`);
  log(`Deployment branches and tags: Selected branches and tags; allow only branch ${values.branch}, with no tags.`);
  for (const kind of ['variables', 'secrets']) {
    for (const [key, value] of Object.entries(values[kind])) {
      log(`\n${kind === 'secrets' ? 'SECRET' : 'VARIABLE'} ${key}\n${value}`);
    }
  }
}

export function install(config, { root = '/', ownerUid = 0, run = command, log = console.log } = {}) {
  validateSetup(config);
  const target = (name) => path.join(root, name);
  const read = (name) => fs.readFileSync(target(name), 'utf8');
  const exists = (name) => fs.existsSync(target(name));
  const ownedDirectory = (name, mode = 0o700, shared = false) => {
    const destination = target(name);
    const present = fs.existsSync(destination);
    fs.mkdirSync(destination, { recursive: true, mode });
    const info = fs.lstatSync(destination);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== ownerUid) throw new Error(`Expected a root-owned real directory at ${name}.`);
    if (!shared || !present) fs.chmodSync(destination, mode);
    if (run('runuser', ['-u', ACCOUNT, '--', 'test', '-w', destination], { absent: true }) !== null) {
      throw new Error(`The deployment account must not be able to write ${name}.`);
    }
  };
  const privateFile = (name) => {
    const info = fs.lstatSync(target(name));
    if (!info.isFile() || info.uid !== ownerUid) throw new Error(`Expected a root-owned regular file at ${name}.`);
    fs.chmodSync(target(name), 0o600);
  };
  const write = (name, content, mode = 0o600) => {
    const destination = target(name);
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) {
      throw new Error(`Refusing a symbolic link at ${name}.`);
    }
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, content, { mode, flag: 'wx' });
    try {
      // Preserve the intended authorized-key/executable permissions even under a restrictive root umask.
      fs.chmodSync(temporary, mode);
      fs.renameSync(temporary, destination);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  };

  const wgFile = `/etc/wireguard/${config.interface}.conf`;
  const wgService = `wg-quick@${config.interface}.service`;
  const sshFile = '/etc/ssh/sshd_config.d/00-calibrate-deploy.conf';
  const firewallFile = '/etc/calibrate/ci-firewall.nft';
  const saved = exists(CONFIG) ? JSON.parse(read(CONFIG)) : null;
  if (saved && (saved.interface !== config.interface || saved.peerAddress !== config.peerAddress || saved.host !== config.host)) {
    throw new Error('Reuse the installed interface and CI addresses. Network/key migration is a separate administrator operation.');
  }
  // Validate dependencies, the running interface, and Compose before changing system configuration.
  for (const binary of ['/usr/bin/node', '/usr/bin/ssh-keygen', '/usr/bin/wg', '/usr/bin/wg-quick',
    '/usr/bin/sudo', '/usr/sbin/sshd', '/usr/sbin/visudo', '/usr/sbin/nft', '/usr/sbin/useradd', '/usr/sbin/usermod', '/usr/sbin/runuser']) {
    if (!fs.existsSync(target(binary))) throw new Error(`Install the prerequisite ${binary} before setup.`);
  }
  const nodeMajor = Number(run('/usr/bin/node', ['--version']).replace(/^v/, '').split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
    throw new Error('The installed wrapper requires Node 22+ at /usr/bin/node.');
  }
  run('systemctl', ['is-active', '--quiet', wgService]);
  const addresses = JSON.parse(run('ip', ['-j', '-4', 'address', 'show', 'dev', config.interface]));
  if (!addresses.some((entry) => entry.addr_info?.some((address) => address.local === config.host))) {
    throw new Error('Deployment host must be an IPv4 address assigned to the local WireGuard interface.');
  }
  if (addresses.some((entry) => entry.addr_info?.some((address) => address.local === config.peerAddress))) {
    throw new Error('The CI peer address is already assigned to the server.');
  }
  const routes = JSON.parse(run('ip', ['-j', 'route', 'show', 'exact', `${config.peerAddress}/32`]));
  if (routes.some((route) => route.dev !== config.interface)) throw new Error('The CI address already has a route through another interface.');
  const originalWg = read(wgFile).replaceAll('\r\n', '\n');
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
  const firewall = firewallRules(config);
  if (run('nft', ['list', 'table', 'inet', 'calibrate_ci'], { absent: true }) !== null && !exists(firewallFile)) {
    throw new Error('The calibrate_ci firewall table already exists without an installer configuration.');
  }
  run('nft', ['--check', '-f', '-'], { input: firewall });
  const oldSsh = exists(sshFile) ? read(sshFile) : null;
  if (oldSsh !== null && !oldSsh.startsWith(MARKER)) throw new Error(`Refusing to replace unmanaged ${sshFile}.`);
  const authorizedKeys = `/etc/ssh/authorized_keys/${ACCOUNT}`;
  if (exists(authorizedKeys) && !exists('/etc/calibrate/ci-ssh-key')) {
    throw new Error('An SSH deployment key already exists. Install its matching private key at /etc/calibrate/ci-ssh-key (root, mode 0600) before rerunning; setup will not rotate it.');
  }

  log('Installing restricted deployment account and retaining any existing CI keys.');
  if (run('id', ['-u', ACCOUNT], { absent: true }) === null) {
    run('useradd', ['--create-home', '--user-group', '--shell', '/bin/sh', ACCOUNT]);
  }
  if (run('id', ['-u', ACCOUNT]) === '0' || run('id', ['-nG', ACCOUNT]) !== ACCOUNT) {
    throw new Error(`${ACCOUNT} must be non-root and belong only to its own group (no Docker or sudo group).`);
  }
  // A fixed non-interactive shell avoids user-controlled Bash startup files before ForceCommand.
  run('usermod', ['--shell', '/bin/sh', ACCOUNT]);
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
  ownedDirectory('/etc/calibrate');
  ownedDirectory('/etc/calibrate/registry');
  ownedDirectory('/etc/ssh/authorized_keys', 0o755, true);
  ownedDirectory('/etc/ssh/sshd_config.d', 0o755, true);
  ownedDirectory('/usr/local/lib', 0o755, true);
  ownedDirectory('/usr/local/sbin', 0o755, true);
  if (!exists('/etc/calibrate/ci-ssh-key')) {
    run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'calibrate-ci', '-f', target('/etc/calibrate/ci-ssh-key')]);
  }
  privateFile('/etc/calibrate/ci-ssh-key');
  const sshPublicKey = run('ssh-keygen', ['-y', '-P', '', '-f', target('/etc/calibrate/ci-ssh-key')])
    .split(/\s+/).slice(0, 2).join(' ');
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(sshPublicKey)) throw new Error('Expected an unencrypted Ed25519 deployment key.');
  if (exists(authorizedKeys) && !read(authorizedKeys).includes(sshPublicKey)) {
    throw new Error('The saved CI private key does not match the existing authorized key. Refusing to replace access.');
  }
  if (!exists('/etc/calibrate/ci-wireguard.key')) write('/etc/calibrate/ci-wireguard.key', `${run('wg', ['genkey'])}\n`);
  privateFile('/etc/calibrate/ci-wireguard.key');
  const wgPrivateKey = read('/etc/calibrate/ci-wireguard.key').trim();
  if (!KEY_PATTERN.test(wgPrivateKey)) throw new Error('Invalid saved CI WireGuard key.');
  const wgPublicKey = run('wg', ['pubkey'], { input: `${wgPrivateKey}\n` });
  const updatedWg = updateWireGuard(originalWg, wgPublicKey, config.peerAddress);
  for (const line of run('wg', ['show', config.interface, 'allowed-ips']).split('\n')) {
    const [key, ...allowed] = line.trim().split(/\s+/);
    if (key !== wgPublicKey) assertUnusedAddress(config.peerAddress, allowed.join(' '));
  }
  write('/etc/calibrate/setup.json', `${JSON.stringify(config, null, 2)}\n`);
  write('/etc/calibrate/deploy.json', `${JSON.stringify(config.deployment, null, 2)}\n`);
  write('/usr/local/lib/calibrate-deploy.mjs', fs.readFileSync(path.join(SOURCE_ROOT, 'scripts/self-hosted-deploy.mjs')), 0o644);
  write('/usr/local/sbin/calibrate-deploy', fs.readFileSync(path.join(SOURCE_ROOT, 'self-hosted/calibrate-deploy')), 0o755);
  write(authorizedKeys, `restrict,command="/usr/bin/sudo -n /usr/local/sbin/calibrate-deploy" ${sshPublicKey} calibrate-ci\n`, 0o644);
  const sudoers = `${ACCOUNT} ALL=(root) NOPASSWD: /usr/local/sbin/calibrate-deploy ""\n`;
  const sudoersTemp = '/etc/calibrate/sudoers.check';
  write(sudoersTemp, sudoers, 0o440);
  try { run('visudo', ['-cf', target(sudoersTemp)]); } finally { fs.unlinkSync(target(sudoersTemp)); }
  write('/etc/sudoers.d/calibrate-deploy', sudoers, 0o440);
  write(sshFile, sshConfiguration(), 0o644);
  try {
    run('sshd', ['-t']);
    verifySshConfiguration(run('sshd', ['-T', '-C', `user=${ACCOUNT},host=localhost,addr=${config.peerAddress},laddr=${config.host},lport=22`]));
  } catch (error) {
    if (oldSsh === null) fs.unlinkSync(target(sshFile));
    else write(sshFile, oldSsh, 0o644);
    throw error;
  }
  run('systemctl', ['reload', 'ssh']);

  log('Applying CI-only firewall restrictions and the WireGuard peer.');
  write(firewallFile, firewall);
  write('/etc/systemd/system/calibrate-ci-firewall.service', `${MARKER}
[Unit]
Description=Restrict the Calibrate CI WireGuard peer
After=nftables.service
Before=${wgService}
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f ${firewallFile}
ExecReload=/usr/sbin/nft -f ${firewallFile}
[Install]
WantedBy=multi-user.target
`, 0o644);
  const dropIn = `/etc/systemd/system/${wgService}.d`;
  ownedDirectory(dropIn, 0o755);
  write(`${dropIn}/calibrate-ci.conf`, `${MARKER}\n[Unit]\nRequires=calibrate-ci-firewall.service\nAfter=calibrate-ci-firewall.service\n`, 0o644);
  run('systemctl', ['daemon-reload']);
  run('systemctl', ['enable', 'calibrate-ci-firewall.service']);
  run('systemctl', ['restart', 'calibrate-ci-firewall.service']);
  write(wgFile, updatedWg);
  try {
    run('wg', ['set', config.interface, 'peer', wgPublicKey, 'allowed-ips', `${config.peerAddress}/32`]);
  } catch (error) {
    write(wgFile, originalWg);
    throw error;
  }
  // wg set updates peers only; wg-quick installs this route automatically on subsequent boots.
  run('ip', ['route', 'replace', `${config.peerAddress}/32`, 'dev', config.interface]);
  const hostKey = read('/etc/ssh/ssh_host_ed25519_key.pub').trim().split(/\s+/).slice(0, 2).join(' ');
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(hostKey)) throw new Error('Expected an Ed25519 SSH host public key.');
  const githubValues = {
    environment: 'self-hosted-testing', branch: 'master',
    variables: { DEPLOY_HOST: config.host, DEPLOY_SSH_USER: ACCOUNT,
      DEPLOY_WG_ADDRESS: config.peerAddress, DEPLOY_WG_PUBLIC_KEY: serverPublicKey },
    secrets: { DEPLOY_WG_ENDPOINT: config.endpoint, DEPLOY_WG_PRIVATE_KEY: wgPrivateKey,
      DEPLOY_SSH_PRIVATE_KEY: read('/etc/calibrate/ci-ssh-key'), DEPLOY_SSH_KNOWN_HOSTS: `${config.host} ${hostKey}` },
  };
  write(EXPORT, `${JSON.stringify(githubValues, null, 2)}\n`);
  log('Setup complete. Compose and its environment were not changed, and no upgrade was run.');
  log('Upgrade and health check: sudo /usr/local/sbin/calibrate-deploy');
  printGithubValues(githubValues, log);
}

async function promptConfiguration() {
  if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (!process.stdin.isTTY) throw new Error('First-time setup needs an interactive terminal.');
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
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

async function main() {
  const mode = process.argv[2] || 'install';
  if (mode === '--help') {
    console.log('sudo node deploy/scripts/setup-self-hosted.mjs [install|github-values]\nInstall on Debian with an existing local wg-quick service, then print the GitHub secrets and variables.\ngithub-values only reprints the saved values.');
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
  install(await promptConfiguration());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[setup] ${error.message}`); process.exitCode = 1; });
}
