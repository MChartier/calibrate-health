import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertUnusedAddress, firewallRules, install, updateWireGuard, validateSetup,
  verifySshConfiguration } from '../scripts/setup-self-hosted.mjs';
import { uninstall } from '../scripts/uninstall-self-hosted.mjs';
import { STATE_FILE, STATE_DIRECTORY } from '../scripts/self-hosted-setup-state.mjs';

const privateKey = 'a'.repeat(43) + '=';
const publicKey = 'b'.repeat(43) + '=';
const serverKey = 'c'.repeat(43) + '=';
const otherKey = 'd'.repeat(43) + '=';
const sshKey = 'ssh-ed25519 AAAATESTCIKEY';
const sshEffective = `port 22
authorizedkeysfile /etc/ssh/authorized_keys/calibrate-deploy
authorizedkeyscommand none
authenticationmethods publickey
passwordauthentication no
kbdinteractiveauthentication no
forcecommand /usr/bin/sudo -n /usr/local/sbin/calibrate-deploy
disableforwarding yes
permittty no
permituserrc no
permittunnel no
`;
const wgOriginal = `[Interface]
PrivateKey = EXISTING_SERVER_SECRET
Address = 10.8.0.1/24
SaveConfig = true
PostUp = existing-firewall-command

[Peer]
PublicKey = ${otherKey}
AllowedIPs = 10.8.0.2/32, 192.168.2.0/24
`;

function fixture(t, options = {}) {
  // Windows maps POSIX read-only modes to an attribute that prevents atomic replacement/deletion.
  // Keep fixture files writable there; the installer itself only runs on Linux.
  if (process.platform === 'win32') {
    const writeFile = fs.writeFileSync;
    const chmod = fs.chmodSync;
    t.mock.method(fs, 'writeFileSync', (file, data, settings) => writeFile(file, data,
      settings?.mode === undefined ? settings : { ...settings, mode: settings.mode | 0o200 }));
    t.mock.method(fs, 'chmodSync', (file, mode) => chmod(file, mode | 0o200));
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = (name) => path.join(root, name);
  const put = (name, content = '') => {
    fs.mkdirSync(path.dirname(target(name)), { recursive: true });
    fs.writeFileSync(target(name), content);
  };
  for (const binary of ['node', 'ssh-keygen', 'wg', 'wg-quick', 'sudo']) put(`/usr/bin/${binary}`);
  for (const binary of ['sshd', 'visudo', 'nft', 'useradd', 'usermod', 'runuser']) put(`/usr/sbin/${binary}`);
  fs.mkdirSync(target('/etc/sudoers.d'), { recursive: true });
  fs.mkdirSync(target('/etc/systemd/system'), { recursive: true });
  fs.mkdirSync(target('/var/lib'), { recursive: true });
  fs.mkdirSync(target('/usr/local'), { recursive: true });
  put('/etc/wireguard/wg0.conf', wgOriginal);
  put('/etc/ssh/ssh_host_ed25519_key.pub', 'ssh-ed25519 AAAAHOSTKEY root@server\n');
  put('/srv/calibrate/compose.yml', 'existing compose bytes');
  put('/srv/calibrate/.env', 'SESSION_SECRET=preserve-existing-secret');
  const config = { interface: 'wg0', host: '10.8.0.1', peerAddress: '10.8.0.20', endpoint: 'vpn.example.test:51820',
    deployment: { projectName: 'calibrate', projectDirectory: target('/srv/calibrate'),
      composeFiles: ['compose.yml'], envFile: '.env', waitTimeoutSeconds: 300 } };
  const calls = [];
  const logs = [];
  const confirmations = [];
  const state = { account: false, group: false, shell: '/bin/sh', peer: null, route: false,
    active: false, enabled: false, table: null };
  const passwd = () => `calibrate-deploy:x:1003:1003::/var/lib/calibrate-deploy-user:${state.shell}`;
  const run = (binary, args, settings = {}) => {
    calls.push({ binary, args, ...settings });
    if (binary === '/usr/bin/node') return options.nodeVersion || 'v22.14.0';
    if (binary === 'systemctl') {
      if (args.at(-1).startsWith('wg-quick@')) {
        if (options.notWgQuick) throw new Error('Inactive wg-quick service');
        return 'active';
      }
      if (args[0] === 'is-active') return state.active ? 'active' : null;
      if (args[0] === 'is-enabled') return state.enabled ? 'enabled' : null;
      if (args[0] === 'enable') state.enabled = true;
      if (args[0] === 'disable') state.enabled = false;
      if (args[0] === 'stop') state.active = false;
      if (args[0] === 'restart') {
        state.active = true;
        state.table = fs.readFileSync(target('/etc/calibrate/ci-firewall.nft'), 'utf8').trim();
      }
    }
    if (binary === 'ip' && args.includes('address')) return JSON.stringify([{ addr_info: [{ local: '10.8.0.1' }] }]);
    if (binary === 'ip' && args[1] === 'route') return JSON.stringify(state.route ? [{ dev: 'wg0', dst: '10.8.0.20/32' }] : []);
    if (binary === 'ip' && args[0] === 'route') state.route = args[1] === 'add';
    if (binary === 'docker') return JSON.stringify({ services: { app: {
      image: options.image || 'ghcr.io/mchartier/calibratehealth:latest',
      healthcheck: options.noHealth ? undefined : { test: ['CMD', 'health'] },
    } } });
    if (binary === 'nft' && args[0] === 'list') return state.table;
    if (binary === 'nft' && options.badFirewall) throw new Error('Invalid firewall');
    if (binary === 'nft' && args[0] === 'delete') state.table = null;
    if (binary === 'nft' && args[0] === '-f') state.table = settings.input.replace(/^delete table inet calibrate_ci\n/, '').trim();
    if (binary === 'id') {
      if (!state.account) return null;
      return args[0] === '-u' ? '1003' : 'calibrate-deploy';
    }
    if (binary === 'getent') {
      if (args[0] === 'passwd') return state.account ? passwd() : args.length === 1 ? '' : null;
      if (args[0] === 'group') return state.group ? 'calibrate-deploy:x:1003:' : null;
    }
    if (binary === 'useradd') { state.account = true; state.group = true; }
    if (binary === 'usermod') state.shell = args[1];
    if (binary === 'userdel') state.account = false;
    if (binary === 'groupdel') state.group = false;
    if (binary === 'runuser') return options.writableStack ? '' : null;
    if (binary === 'ssh-keygen') {
      if (args[0] === '-y') return `${sshKey} calibrate-ci`;
      fs.writeFileSync(args.at(-1), 'PRIVATE_SSH_TEST_KEY\n', { mode: 0o600 });
      fs.writeFileSync(`${args.at(-1)}.pub`, `${sshKey} calibrate-ci\n`, { mode: 0o644 });
    }
    if (binary === 'wg') {
      if (args[0] === 'genkey') return privateKey;
      if (args[0] === 'pubkey') return publicKey;
      if (args.at(-1) === 'public-key') return serverKey;
      if (args.at(-1) === 'interfaces') return 'wg0';
      if (args.at(-1) === 'allowed-ips') return `${otherKey}\t${options.occupiedAddress || '10.8.0.2/32'}${state.peer === null ? '' : `\n${publicKey}\t${state.peer}`}`;
      if (args[0] === 'set' && options.peerFailure) throw new Error('Peer update failed');
      if (args[0] === 'set') state.peer = args.at(-1) === 'remove' ? null : args.at(-1);
    }
    if (binary === 'sshd' && args[0] === '-T') return options.badSsh ? sshEffective.replace('disableforwarding yes', 'disableforwarding no') : sshEffective;
    return '';
  };
  const settings = (confirm = () => true) => ({ root, ownerUid: process.getuid?.() ?? 0, run,
    log: (line) => logs.push(line), confirm: async (description) => {
      confirmations.push(description);
      return confirm(description);
    } });
  return { config, calls, logs, target, put, root, state, options, confirmations,
    run: (confirm) => install(config, settings(confirm)), uninstall: (confirm) => uninstall(settings(confirm)) };
}

test('installer configures the fixed SSH command and restricted peer without changing or restarting Compose', async (t) => {
  const f = fixture(t);
  await f.run();
  const read = (name) => fs.readFileSync(f.target(name), 'utf8');
  assert.equal(read('/srv/calibrate/compose.yml'), 'existing compose bytes');
  assert.equal(read('/srv/calibrate/.env'), 'SESSION_SECRET=preserve-existing-secret');
  assert.ok(!f.calls.some(({ args }) => args.includes('pull') || args.includes('up')));
  assert.match(read('/etc/ssh/authorized_keys/calibrate-deploy'), /^restrict,command="\/usr\/bin\/sudo -n \/usr\/local\/sbin\/calibrate-deploy" ssh-ed25519 /);
  assert.equal(read('/etc/sudoers.d/calibrate-deploy'), 'calibrate-deploy ALL=(root) NOPASSWD: /usr/local/sbin/calibrate-deploy ""\n');
  assert.match(read('/etc/ssh/sshd_config.d/00-calibrate-deploy.conf'), /ForceCommand \/usr\/bin\/sudo -n \/usr\/local\/sbin\/calibrate-deploy/);
  assert.ok(f.calls.some(({ binary, args }) => binary === 'visudo' && args[0] === '-cf'));
  const firewallIndex = f.calls.findIndex(({ binary, args }) => binary === 'systemctl' && args[0] === 'restart');
  const peerIndex = f.calls.findIndex(({ binary, args }) => binary === 'wg' && args[0] === 'set');
  assert.ok(firewallIndex >= 0 && peerIndex > firewallIndex);
  assert.deepEqual(f.calls[peerIndex].args, ['set', 'wg0', 'peer', publicKey, 'allowed-ips', '10.8.0.20/32']);
  assert.ok(!f.calls.some(({ args }) => args.includes('syncconf') || args.includes('setconf')));
  assert.ok(read('/etc/wireguard/wg0.conf').startsWith(wgOriginal.trimEnd()));
  assert.match(read('/etc/systemd/system/wg-quick@wg0.service.d/calibrate-ci.conf'), /Requires=calibrate-ci-firewall.service/);
  assert.deepEqual(f.calls.find(({ binary, args }) => binary === 'ip' && args[0] === 'route').args,
    ['route', 'add', '10.8.0.20/32', 'dev', 'wg0']);
  const github = JSON.parse(read('/etc/calibrate/github-environment.json'));
  assert.equal(github.variables.DEPLOY_WG_PUBLIC_KEY, serverKey);
  assert.equal(github.secrets.DEPLOY_WG_PRIVATE_KEY, privateKey);
  assert.equal(github.secrets.DEPLOY_SSH_PRIVATE_KEY, 'PRIVATE_SSH_TEST_KEY\n');
  assert.equal(github.secrets.DEPLOY_SSH_KNOWN_HOSTS, '10.8.0.1 ssh-ed25519 AAAAHOSTKEY');
  assert.equal(github.secrets.DEPLOY_WG_ENDPOINT, f.config.endpoint);
  assert.ok(!JSON.stringify(github).includes('EXISTING_SERVER_SECRET'));
  const output = f.logs.join('\n');
  assert.match(output, /self-hosted-testing GitHub environment/);
  assert.match(output, /allow only branch master, with no tags/);
  assert.ok(output.indexOf('Setup complete.') < output.indexOf('SECRET DEPLOY_WG_PRIVATE_KEY'));
  for (const [kind, values] of Object.entries({ VARIABLE: github.variables, SECRET: github.secrets })) {
    for (const [name, value] of Object.entries(values)) assert.ok(output.includes(`${kind} ${name}\n${value}`), name);
  }
  assert.ok(!output.includes('EXISTING_SERVER_SECRET'));
  if (process.platform !== 'win32') {
    for (const [file, mode] of [
      ['/etc/calibrate/ci-ssh-key', 0o600], ['/etc/calibrate/ci-wireguard.key', 0o600],
      ['/etc/calibrate/github-environment.json', 0o600], ['/etc/sudoers.d/calibrate-deploy', 0o440],
      ['/etc/ssh/authorized_keys/calibrate-deploy', 0o644], ['/usr/local/sbin/calibrate-deploy', 0o755],
    ]) assert.equal(fs.statSync(f.target(file)).mode & 0o777, mode, file);
  }
});

test('rerunning setup preserves keys and produces one identical managed peer', async (t) => {
  const f = fixture(t);
  await f.run();
  const before = fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8');
  const credentials = fs.readFileSync(f.target('/etc/calibrate/github-environment.json'), 'utf8');
  const approvalsBefore = f.confirmations.length;
  const recordBefore = fs.statSync(f.target(STATE_FILE)).mtimeMs;
  const helperBefore = fs.statSync(f.target('/usr/local/sbin/calibrate-deploy')).mtimeMs;
  const callsBefore = f.calls.length;
  await f.run();
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), before);
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/github-environment.json'), 'utf8'), credentials);
  assert.equal(f.calls.filter(({ binary, args }) => binary === 'ssh-keygen' && args[0] !== '-y').length, 1);
  assert.equal(f.calls.filter(({ binary, args }) => binary === 'wg' && args[0] === 'genkey').length, 1);
  assert.equal(f.confirmations.length, approvalsBefore, 'an unchanged rerun needs no mutation approvals');
  assert.equal(fs.statSync(f.target(STATE_FILE)).mtimeMs, recordBefore);
  assert.equal(fs.statSync(f.target('/usr/local/sbin/calibrate-deploy')).mtimeMs, helperBefore);
  assert.ok(!f.calls.slice(callsBefore).some(({ binary, args }) =>
    ['useradd', 'usermod'].includes(binary) || ['enable', 'restart', 'reload', 'daemon-reload', 'set', 'add'].includes(args[0])));
});

test('existing manual SSH access is not silently replaced with a new key', async (t) => {
  const f = fixture(t);
  f.put('/etc/ssh/authorized_keys/calibrate-deploy', 'existing key');
  await assert.rejects(() => f.run(), /will not rotate/);
  assert.equal(fs.readFileSync(f.target('/etc/ssh/authorized_keys/calibrate-deploy'), 'utf8'), 'existing key');
  assert.ok(!f.calls.some(({ binary }) => binary === 'useradd' || binary === 'ssh-keygen'));
});

test('invalid effective SSH policy restores the prior drop-in without reloading sshd or adding a peer', async (t) => {
  const f = fixture(t, { badSsh: true });
  const original = '# Managed by calibrate deployment setup\n# previous installation\n';
  f.put('/etc/ssh/sshd_config.d/00-calibrate-deploy.conf', original);
  await assert.rejects(() => f.run(), /override disableforwarding/);
  assert.equal(fs.readFileSync(f.target('/etc/ssh/sshd_config.d/00-calibrate-deploy.conf'), 'utf8'), original);
  assert.ok(!f.calls.some(({ binary, args }) => (binary === 'systemctl' && args[0] === 'reload') || (binary === 'wg' && args[0] === 'set')));
});

test('failed WireGuard application retains recorded changes that uninstall can clean up', async (t) => {
  const f = fixture(t, { peerFailure: true });
  await assert.rejects(() => f.run(), /Peer update failed/);
  assert.match(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), /BEGIN calibrate CI peer/);
  assert.equal(fs.existsSync(f.target('/etc/calibrate/github-environment.json')), false);
  assert.ok(!f.logs.join('\n').includes('SECRET DEPLOY_'));
  f.options.peerFailure = false;
  await f.uninstall();
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wgOriginal);
  assert.equal(fs.existsSync(f.target(STATE_FILE)), false);
});

for (const options of [{ noHealth: true }, { image: 'app:v1.0.0' }, { badFirewall: true },
  { notWgQuick: true }, { nodeVersion: 'v20.19.0' }]) {
  test('unsupported prerequisites fail before host changes: ' + JSON.stringify(options), async (t) => {
    const f = fixture(t, options);
    await assert.rejects(() => f.run());
    assert.ok(!f.calls.some(({ binary }) => binary === 'useradd'));
    assert.equal(fs.existsSync(f.target('/etc/calibrate')), false);
  });
}

test('a CI-writable Compose path blocks setup before keys or privileged SSH access', async (t) => {
  const f = fixture(t, { writableStack: true });
  await assert.rejects(() => f.run(), /deployment account can write/);
  assert.equal(fs.existsSync(f.target('/etc/ssh/authorized_keys/calibrate-deploy')), false);
});

test('a conflicting live peer blocks installation before modifying SSH or WireGuard config', async (t) => {
  const f = fixture(t, { occupiedAddress: '10.8.0.20/32' });
  await assert.rejects(() => f.run(), /overlaps/);
  assert.equal(fs.existsSync(f.target('/etc/ssh/authorized_keys/calibrate-deploy')), false);
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wgOriginal);
});

test('WireGuard updates preserve unrelated settings, reject overlapping ranges and malformed markers', () => {
  const updated = updateWireGuard(wgOriginal, publicKey, '10.8.0.20');
  assert.equal(updateWireGuard(updated, publicKey, '10.8.0.20'), updated);
  for (const address of ['10.8.0.2', '192.168.2.10']) assert.throws(() => updateWireGuard(wgOriginal, publicKey, address), /overlaps/);
  assert.throws(() => assertUnusedAddress('10.8.0.20', '0.0.0.0/0'), /overlaps/);
  assert.throws(() => updateWireGuard(updated, otherKey, '10.8.0.20'), /different key/);
  assert.throws(() => updateWireGuard(updated.replace('# END calibrate CI peer', ''), publicKey, '10.8.0.20'), /Malformed/);
  assert.throws(() => updateWireGuard(updated + updated, publicKey, '10.8.0.20'), /Malformed/);
});

test('setup recognizes its existing peer after wg-quick SaveConfig removes comments', () => {
  const saved = updateWireGuard(wgOriginal, publicKey, '10.8.0.20')
    .replace('# BEGIN calibrate CI peer\n', '').replace('# END calibrate CI peer\n', '');
  assert.equal(updateWireGuard(saved, publicKey, '10.8.0.20'), saved);
  assert.throws(() => updateWireGuard(saved.replace('10.8.0.20/32', '10.8.0.0/24'), publicKey, '10.8.0.20'), /unexpected AllowedIPs/);
});

test('input validation prevents configuration injection and the firewall confines only the CI source', async (t) => {
  const f = fixture(t);
  for (const override of [{ interface: 'wg0"; drop' }, { peerAddress: '10.0.0.1\nanything' }, { host: '0.0.0.0/0' },
    { endpoint: 'vpn.example.test:123\nanything' }, { peerAddress: f.config.host }]) {
    assert.throws(() => validateSetup({ ...f.config, ...override }));
  }
  const firewall = firewallRules(f.config);
  assert.match(firewall, /ip saddr 10\.8\.0\.20 ip daddr 10\.8\.0\.1 tcp dport 22 accept/);
  assert.match(firewall, /chain forward[\s\S]*iifname "wg0" ip saddr 10\.8\.0\.20 drop/);
  assert.equal((firewall.match(/ip saddr 10\.8\.0\.20 drop/g) || []).length, 2);
  assert.doesNotMatch(firewall, /flush ruleset|policy drop|0\.0\.0\.0\/0/);
  assert.doesNotThrow(() => verifySshConfiguration(sshEffective));
  assert.throws(() => verifySshConfiguration(sshEffective.replace('forcecommand /usr/bin/sudo -n /usr/local/sbin/calibrate-deploy', 'forcecommand none')), /override forcecommand/);
});

test('declining the first change leaves the system untouched', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => f.run(() => false), /Cancelled/);
  assert.equal(fs.existsSync(f.target(STATE_DIRECTORY)), false);
  assert.equal(fs.existsSync(f.target('/etc/calibrate')), false);
  assert.equal(f.state.account, false);
  assert.ok(f.logs.some((line) => line.startsWith('[change]')));
  assert.ok(f.logs.some((line) => line.startsWith('[stopped]')));
});

test('declining a peer change stops before it and setup resumes without recreating earlier assets', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => f.run((description) => !description.startsWith('Add the dedicated CI peer')), /Cancelled/);
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wgOriginal);
  assert.equal(f.state.peer, null);
  const key = fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key'), 'utf8');
  const offset = f.confirmations.length;
  await f.run();
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key'), 'utf8'), key);
  assert.ok(!f.confirmations.slice(offset).some((description) => description.startsWith('Generate') || description.startsWith('Create account')));
  assert.equal(f.state.peer, '10.8.0.20/32');
});

test('uninstall removes created assets and subsequent uninstall does nothing', async (t) => {
  const f = fixture(t);
  await f.run();
  await f.uninstall();
  for (const name of [STATE_DIRECTORY, '/etc/calibrate', '/usr/local/sbin/calibrate-deploy',
    '/usr/local/lib/calibrate-deploy.mjs', '/etc/sudoers.d/calibrate-deploy',
    '/etc/ssh/authorized_keys/calibrate-deploy', '/etc/ssh/sshd_config.d/00-calibrate-deploy.conf',
    '/etc/systemd/system/calibrate-ci-firewall.service', '/etc/systemd/system/wg-quick@wg0.service.d',
    '/var/lib/calibrate-deploy-user']) assert.equal(fs.existsSync(f.target(name)), false, name);
  assert.deepEqual(f.state, { account: false, group: false, shell: '/bin/sh', peer: null, route: false,
    active: false, enabled: false, table: null });
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wgOriginal);
  assert.equal(fs.readFileSync(f.target('/srv/calibrate/compose.yml'), 'utf8'), 'existing compose bytes');
  assert.equal(fs.readFileSync(f.target('/srv/calibrate/.env'), 'utf8'), 'SESSION_SECRET=preserve-existing-secret');
  const approvals = f.confirmations.length;
  const calls = f.calls.length;
  await f.uninstall(() => { throw new Error('Unexpected confirmation after uninstall'); });
  assert.equal(f.confirmations.length, approvals);
  assert.equal(f.calls.length, calls);
});

test('uninstall preserves imported assets and restores files and settings that existed before setup', async (t) => {
  const f = fixture(t);
  f.state.account = true;
  f.state.group = true;
  f.state.shell = '/bin/bash';
  f.state.peer = '10.8.0.20/32';
  f.state.route = true;
  f.state.active = true;
  f.state.enabled = true;
  f.state.table = 'table inet calibrate_ci { # pre-existing policy }';
  f.put('/etc/calibrate/ci-firewall.nft', '# previous firewall file\n');
  f.put('/etc/calibrate/ci-ssh-key', 'PRIVATE_SSH_TEST_KEY\n');
  f.put('/etc/calibrate/ci-ssh-key.pub', `${sshKey} original-comment\n`);
  f.put('/etc/calibrate/ci-wireguard.key', `${privateKey}\n`);
  f.put('/usr/local/sbin/calibrate-deploy', 'original helper\n');
  const existingWg = updateWireGuard(wgOriginal, publicKey, '10.8.0.20')
    .replace('# END calibrate CI peer', 'PersistentKeepalive = 25\n# END calibrate CI peer');
  f.put('/etc/wireguard/wg0.conf', existingWg);
  const originalState = { ...f.state };
  await f.run();
  await f.uninstall();
  assert.deepEqual(f.state, originalState);
  assert.equal(fs.readFileSync(f.target('/usr/local/sbin/calibrate-deploy'), 'utf8'), 'original helper\n');
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/ci-firewall.nft'), 'utf8'), '# previous firewall file\n');
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key'), 'utf8'), 'PRIVATE_SSH_TEST_KEY\n');
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key.pub'), 'utf8'), `${sshKey} original-comment\n`);
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), existingWg);
});

test('uninstall removes the CI peer after SaveConfig while retaining peers added later', async (t) => {
  const f = fixture(t);
  await f.run();
  const saved = fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8')
    .replace('# BEGIN calibrate CI peer\n', '').replace('# END calibrate CI peer\n', '');
  const laterPeer = `\n[Peer]\nPublicKey = ${'e'.repeat(43)}=\nAllowedIPs = 10.8.0.99/32\n`;
  f.put('/etc/wireguard/wg0.conf', saved.replaceAll('[Peer]', '  [Peer]') + laterPeer);
  f.put('/etc/calibrate/registry/config.json', 'externally supplied registry credentials');
  await f.uninstall();
  const result = fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8');
  assert.ok(result.includes(laterPeer.trim()));
  assert.ok(result.includes(otherKey));
  assert.ok(!result.includes(publicKey));
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/registry/config.json'), 'utf8'), 'externally supplied registry credentials');
  assert.ok(f.logs.some((line) => line.startsWith('[preserved]')));
});

test('uninstall stops before a declined deletion and resumes remaining work', async (t) => {
  const f = fixture(t);
  await f.run();
  const key = fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key'), 'utf8');
  await assert.rejects(() => f.uninstall((description) => !description.startsWith('Remove created file /etc/calibrate/ci-ssh-key.')), /Cancelled/);
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/ci-ssh-key'), 'utf8'), key);
  assert.ok(fs.existsSync(f.target(STATE_FILE)));
  await assert.rejects(() => f.run(), /Finish the interrupted uninstall/);
  await f.uninstall();
  assert.equal(fs.existsSync(f.target('/etc/calibrate')), false);
  assert.equal(fs.existsSync(f.target(STATE_FILE)), false);
});

test('each system mutation is preceded by a confirmation and a progress description', async (t) => {
  const f = fixture(t);
  await f.run((description) => {
    assert.equal(f.logs.at(-1), `[change] ${description}`);
    return true;
  });
  await f.uninstall((description) => {
    assert.equal(f.logs.at(-1), `[change] ${description}`);
    return true;
  });
  assert.equal(f.logs.filter((line) => line.startsWith('[change]')).length, f.confirmations.length);
  assert.equal(f.logs.filter((line) => line.startsWith('[done]')).length, f.confirmations.length);
});

test('declining uninstall before its first change preserves the complete installation', async (t) => {
  const f = fixture(t);
  await f.run();
  const record = fs.readFileSync(f.target(STATE_FILE), 'utf8');
  const wg = fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8');
  const state = { ...f.state };
  await assert.rejects(() => f.uninstall(() => false), /Cancelled/);
  assert.equal(fs.readFileSync(f.target(STATE_FILE), 'utf8'), record);
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wg);
  assert.deepEqual(f.state, state);
});

test('uninstall rejects unexpected recorded paths before removing any assets', async (t) => {
  const f = fixture(t);
  await f.run();
  const record = JSON.parse(fs.readFileSync(f.target(STATE_FILE), 'utf8'));
  record.files['/etc/passwd'] = { before: null };
  f.put(STATE_FILE, JSON.stringify(record));
  const approvals = f.confirmations.length;
  await assert.rejects(() => f.uninstall(), /Unexpected recorded file/);
  assert.equal(f.confirmations.length, approvals);
  assert.equal(f.state.peer, '10.8.0.20/32');
});
