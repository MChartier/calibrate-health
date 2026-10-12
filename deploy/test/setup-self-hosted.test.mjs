import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertUnusedAddress, firewallRules, install, updateWireGuard, validateSetup,
  verifySshConfiguration } from '../scripts/setup-self-hosted.mjs';

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
  put('/etc/wireguard/wg0.conf', wgOriginal);
  put('/etc/ssh/ssh_host_ed25519_key.pub', 'ssh-ed25519 AAAAHOSTKEY root@server\n');
  put('/srv/calibrate/compose.yml', 'existing compose bytes');
  put('/srv/calibrate/.env', 'SESSION_SECRET=preserve-existing-secret');
  const config = { interface: 'wg0', host: '10.8.0.1', peerAddress: '10.8.0.20', endpoint: 'vpn.example.test:51820',
    deployment: { projectName: 'calibrate', projectDirectory: target('/srv/calibrate'),
      composeFiles: ['compose.yml'], envFile: '.env', waitTimeoutSeconds: 300 } };
  const calls = [];
  const logs = [];
  let accountExists = false;
  const run = (binary, args, settings = {}) => {
    calls.push({ binary, args, ...settings });
    if (binary === '/usr/bin/node') return options.nodeVersion || 'v22.14.0';
    if (binary === 'systemctl' && args[0] === 'is-active' && options.notWgQuick) throw new Error('Inactive wg-quick service');
    if (binary === 'ip' && args.includes('address')) return JSON.stringify([{ addr_info: [{ local: '10.8.0.1' }] }]);
    if (binary === 'ip' && args[1] === 'route') return '[]';
    if (binary === 'docker') return JSON.stringify({ services: { app: {
      image: options.image || 'ghcr.io/mchartier/calibratehealth:latest',
      healthcheck: options.noHealth ? undefined : { test: ['CMD', 'health'] },
    } } });
    if (binary === 'nft' && args[0] === 'list') return null;
    if (binary === 'nft' && options.badFirewall) throw new Error('Invalid firewall');
    if (binary === 'id') {
      if (!accountExists) return null;
      return args[0] === '-u' ? '1003' : 'calibrate-deploy';
    }
    if (binary === 'useradd') accountExists = true;
    if (binary === 'runuser') return options.writableStack ? '' : null;
    if (binary === 'ssh-keygen') {
      if (args[0] === '-y') return `${sshKey} calibrate-ci`;
      fs.writeFileSync(args.at(-1), 'PRIVATE_SSH_TEST_KEY\n');
    }
    if (binary === 'wg') {
      if (args[0] === 'genkey') return privateKey;
      if (args[0] === 'pubkey') return publicKey;
      if (args.at(-1) === 'public-key') return serverKey;
      if (args.at(-1) === 'allowed-ips') return `${otherKey}\t${options.occupiedAddress || '10.8.0.2/32'}`;
      if (args[0] === 'set' && options.peerFailure) throw new Error('Peer update failed');
    }
    if (binary === 'sshd' && args[0] === '-T') return options.badSsh ? sshEffective.replace('disableforwarding yes', 'disableforwarding no') : sshEffective;
    return '';
  };
  return { config, calls, logs, target, put,
    run: () => install(config, { root, ownerUid: process.getuid?.() ?? 0, run, log: (line) => logs.push(line) }) };
}

test('installer configures the fixed SSH command and restricted peer without changing or restarting Compose', (t) => {
  const f = fixture(t);
  f.run();
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
    ['route', 'replace', '10.8.0.20/32', 'dev', 'wg0']);
  const github = JSON.parse(read('/etc/calibrate/github-environment.json'));
  assert.equal(github.variables.DEPLOY_WG_PUBLIC_KEY, serverKey);
  assert.equal(github.secrets.DEPLOY_WG_PRIVATE_KEY, privateKey);
  assert.equal(github.secrets.DEPLOY_SSH_PRIVATE_KEY, 'PRIVATE_SSH_TEST_KEY\n');
  assert.equal(github.secrets.DEPLOY_SSH_KNOWN_HOSTS, '10.8.0.1 ssh-ed25519 AAAAHOSTKEY');
  assert.equal(github.secrets.DEPLOY_WG_ENDPOINT, f.config.endpoint);
  assert.ok(!JSON.stringify(github).includes('EXISTING_SERVER_SECRET'));
  assert.ok(!f.logs.join('\n').includes(privateKey));
  assert.ok(!f.logs.join('\n').includes('PRIVATE_SSH_TEST_KEY'));
  if (process.platform !== 'win32') {
    for (const [file, mode] of [
      ['/etc/calibrate/ci-ssh-key', 0o600], ['/etc/calibrate/ci-wireguard.key', 0o600],
      ['/etc/calibrate/github-environment.json', 0o600], ['/etc/sudoers.d/calibrate-deploy', 0o440],
      ['/etc/ssh/authorized_keys/calibrate-deploy', 0o644], ['/usr/local/sbin/calibrate-deploy', 0o755],
    ]) assert.equal(fs.statSync(f.target(file)).mode & 0o777, mode, file);
  }
});

test('rerunning setup preserves keys and produces one identical managed peer', (t) => {
  const f = fixture(t);
  f.run();
  const before = fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8');
  const credentials = fs.readFileSync(f.target('/etc/calibrate/github-environment.json'), 'utf8');
  f.run();
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), before);
  assert.equal(fs.readFileSync(f.target('/etc/calibrate/github-environment.json'), 'utf8'), credentials);
  assert.equal(f.calls.filter(({ binary, args }) => binary === 'ssh-keygen' && args[0] !== '-y').length, 1);
  assert.equal(f.calls.filter(({ binary, args }) => binary === 'wg' && args[0] === 'genkey').length, 1);
});

test('existing manual SSH access is not silently replaced with a new key', (t) => {
  const f = fixture(t);
  f.put('/etc/ssh/authorized_keys/calibrate-deploy', 'existing key');
  assert.throws(f.run, /will not rotate/);
  assert.equal(fs.readFileSync(f.target('/etc/ssh/authorized_keys/calibrate-deploy'), 'utf8'), 'existing key');
  assert.ok(!f.calls.some(({ binary }) => binary === 'useradd' || binary === 'ssh-keygen'));
});

test('invalid effective SSH policy restores the prior drop-in without reloading sshd or adding a peer', (t) => {
  const f = fixture(t, { badSsh: true });
  const original = '# Managed by calibrate deployment setup\n# previous installation\n';
  f.put('/etc/ssh/sshd_config.d/00-calibrate-deploy.conf', original);
  assert.throws(f.run, /override disableforwarding/);
  assert.equal(fs.readFileSync(f.target('/etc/ssh/sshd_config.d/00-calibrate-deploy.conf'), 'utf8'), original);
  assert.ok(!f.calls.some(({ binary, args }) => (binary === 'systemctl' && args[0] === 'reload') || (binary === 'wg' && args[0] === 'set')));
});

test('failed WireGuard application restores the original persisted configuration', (t) => {
  const f = fixture(t, { peerFailure: true });
  assert.throws(f.run, /Peer update failed/);
  assert.equal(fs.readFileSync(f.target('/etc/wireguard/wg0.conf'), 'utf8'), wgOriginal);
  assert.equal(fs.existsSync(f.target('/etc/calibrate/github-environment.json')), false);
});

for (const options of [{ noHealth: true }, { image: 'app:v1.0.0' }, { badFirewall: true },
  { notWgQuick: true }, { nodeVersion: 'v20.19.0' }]) {
  test('unsupported prerequisites fail before host changes: ' + JSON.stringify(options), (t) => {
    const f = fixture(t, options);
    assert.throws(f.run);
    assert.ok(!f.calls.some(({ binary }) => binary === 'useradd'));
    assert.equal(fs.existsSync(f.target('/etc/calibrate')), false);
  });
}

test('a CI-writable Compose path blocks setup before keys or privileged SSH access', (t) => {
  const f = fixture(t, { writableStack: true });
  assert.throws(f.run, /deployment account can write/);
  assert.equal(fs.existsSync(f.target('/etc/ssh/authorized_keys/calibrate-deploy')), false);
});

test('a conflicting live peer blocks installation before modifying SSH or WireGuard config', (t) => {
  const f = fixture(t, { occupiedAddress: '10.8.0.20/32' });
  assert.throws(f.run, /overlaps/);
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

test('input validation prevents configuration injection and the firewall confines only the CI source', (t) => {
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
