/**
 * @file Undo recorded deployment setup changes with confirmation before each
 * mutation. Restore pre-existing assets and retain progress for interrupted runs.
 */
import fs from 'node:fs';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeWireGuardPeer } from './setup-self-hosted.mjs';
import { ACCOUNT, ACCOUNT_HOME, fingerprint, HostChanges, SSH_FILE,
  STATE_DIRECTORY, STATE_FILE, withConfirmation } from './self-hosted-setup-state.mjs';

/** Limit uninstall to known installer resources and validated network identities. */
function validateRecord(state) {
  for (const name of Object.keys(state.resources)) {
    if (!['peer', 'route', 'account'].includes(name)) throw new Error(`Unexpected recorded resource: ${name}`);
  }
  const network = [state.resources.peer, state.resources.route].filter(Boolean);
  for (const entry of network) {
    if (!/^[a-zA-Z0-9_-]{1,15}$/.test(entry.interface) || !isIPv4(entry.address)) throw new Error('Invalid network installation record.');
  }
  if (state.resources.peer && !/^[A-Za-z0-9+/]{43}=$/.test(state.resources.peer.publicKey)) throw new Error('Invalid recorded CI public key.');
  const files = new Set([
    '/etc/calibrate/setup.json', '/etc/calibrate/deploy.json', '/etc/calibrate/github-environment.json',
    '/etc/calibrate/ci-ssh-key', '/etc/calibrate/ci-ssh-key.pub', '/etc/calibrate/ci-wireguard.key',
    '/usr/local/lib/calibrate-deploy.mjs', '/usr/local/sbin/calibrate-deploy',
    `/etc/ssh/authorized_keys/${ACCOUNT}`, `/etc/sudoers.d/${ACCOUNT}`, SSH_FILE,
  ]);
  const directories = new Set(['/etc/calibrate', '/etc/calibrate/registry', '/etc/ssh/authorized_keys',
    '/etc/ssh/sshd_config.d', '/usr/local/lib', '/usr/local/sbin', ACCOUNT_HOME]);
  for (const name of Object.keys(state.files)) {
    if (!files.has(name)) {
      throw new Error(`Unexpected recorded file: ${name}`);
    }
  }
  for (const name of Object.keys(state.directories)) {
    if (!directories.has(name)) {
      throw new Error(`Unexpected recorded directory: ${name}`);
    }
  }
}

/** Resume removal or restoration of recorded assets while preserving Compose, data, and unrelated host state. */
export async function uninstall(options = {}) {
  const host = new HostChanges(options);
  const { run, log } = host;
  if (!host.state) { log('[unchanged] No recorded installation; nothing to uninstall.'); return; }
  validateRecord(host.state);
  host.uninstalling = true;
  log('[check] Removing only recorded installation changes. Existing Compose, database, VPN peers, and imported assets are preserved.');
  /** Persist completed resource cleanup so later retries do not repeat it. */
  const forget = (name) => { delete host.state.resources[name]; host.save(); };
  const peer = host.state.resources.peer;
  if (peer) {
    const wgFile = `/etc/wireguard/${peer.interface}.conf`;
    if (peer.configCreated && host.exists(wgFile)) {
      host.assertOwned(wgFile);
      const current = host.read(wgFile);
      const updated = removeWireGuardPeer(current, peer.publicKey);
      if (updated !== current) {
        await host.change(`Remove only the installed CI peer ${peer.address}/32 from ${wgFile}.`, () => {
          host.atomicWrite(wgFile, updated, peer.configMode);
        });
      } else host.skip('CI peer already absent from the WireGuard configuration');
    }
    const interfaces = run('wg', ['show', 'interfaces']).split(/\s+/);
    if (interfaces.includes(peer.interface)) {
      const line = run('wg', ['show', peer.interface, 'allowed-ips']).split('\n')
        .find((entry) => entry.split(/\s+/)[0] === peer.publicKey);
      const currentAllowed = line ? line.split(/\s+/).slice(1).join(' ').replaceAll(',', ' ').trim() : null;
      if (currentAllowed !== peer.liveBefore) {
        await host.change(`${peer.liveBefore === null ? 'Remove the installed' : 'Restore the original'} live CI peer on ${peer.interface}.`, () => {
          const args = peer.liveBefore === null ? ['remove'] : ['allowed-ips', peer.liveBefore === '(none)' ? '' : peer.liveBefore.split(/\s+/).join(',')];
          run('wg', ['set', peer.interface, 'peer', peer.publicKey, ...args]);
        });
      } else host.skip('Live WireGuard peer already matches its original state');
    } else host.skip('WireGuard interface is down; no live peer to remove');
    forget('peer');
  }
  const route = host.state.resources.route;
  if (route) {
    const current = JSON.parse(run('ip', ['-j', 'route', 'show', 'exact', `${route.address}/32`]));
    if (current.some((entry) => entry.dev !== route.interface)) throw new Error('The recorded CI route now belongs to another interface; leaving it unchanged.');
    if (current.length) {
      await host.change(`Remove the installed route ${route.address}/32 through ${route.interface}.`, () => {
        run('ip', ['route', 'del', `${route.address}/32`, 'dev', route.interface]);
      });
    } else host.skip('CI route already absent');
    forget('route');
  }

  for (const [name, record] of Object.entries(host.state.files).reverse()) {
    const current = host.snapshot(name);
    const alreadyRestored = record.before === null ? current === null
      : current?.data === record.before.data && host.modeMatches(current.mode, record.before.mode);
    if (alreadyRestored) host.skip(`Original state already restored: ${name}`);
    else {
      const modified = current && record.after && fingerprint(Buffer.from(current.data, 'base64')) !== record.after;
      await host.change(`${record.before === null ? 'Remove created file' : 'Restore original file'} ${name}${modified ? ' (replacing edits made after setup)' : ''}.`, () => {
        if (name === SSH_FILE) host.state.pending.sshReload = true;
        host.save();
        if (record.before === null) fs.unlinkSync(host.target(name));
        else host.atomicWrite(name, Buffer.from(record.before.data, 'base64'), record.before.mode);
      });
    }
    delete host.state.files[name];
    host.save();
  }
  if (host.state.pending.sshReload) run('sshd', ['-t']);
  await host.reload('sshReload', 'Reload SSH after restoring its original configuration.', 'systemctl', ['reload', 'ssh']);

  const account = host.state.resources.account;
  if (account) {
    const current = run('getent', ['passwd', ACCOUNT], { absent: true, missingCodes: [2] });
    if (current !== null) {
      const fields = current.split(':');
      if (fields[2] === '0' || (account.uid !== null && fields[2] !== account.uid)) throw new Error('Deployment account identity changed; refusing to remove or modify it.');
      if (account.created) await host.change(`Remove the account ${ACCOUNT} created by setup (without deleting home contents).`, () => run('userdel', [ACCOUNT]));
      else if (fields[6] !== account.shell) await host.change(`Restore ${ACCOUNT}'s original login shell ${account.shell}.`, () => run('usermod', ['--shell', account.shell, ACCOUNT]));
      else host.skip('Pre-existing deployment account shell');
    } else host.skip('Deployment account already absent');
    if (account.created) {
      const group = run('getent', ['group', ACCOUNT], { absent: true, missingCodes: [2] });
      if (group !== null) {
        const fields = group.split(':');
        const users = run('getent', ['passwd']).split('\n').filter((line) => line.split(':')[3] === fields[2]);
        if ((account.gid !== null && fields[2] !== account.gid) || fields[3] || users.length) {
          throw new Error('Deployment group changed or is in use; leaving it unchanged.');
        }
        await host.change(`Remove the empty group ${ACCOUNT} created by setup.`, () => run('groupdel', [ACCOUNT]));
      } else host.skip('Deployment group already absent');
    }
    forget('account');
  }
  for (const [name, record] of Object.entries(host.state.directories).sort(([a], [b]) => b.length - a.length)) {
    if (!host.exists(name)) host.skip(`Directory already absent: ${name}`);
    else {
      const info = host.assertOwned(name, true);
      if (record.beforeMode === null) {
        if (fs.readdirSync(host.target(name)).length) log(`[preserved] Nonempty directory ${name} contains files not created by setup.`);
        else await host.change(`Remove empty directory ${name} created by setup.`, () => fs.rmdirSync(host.target(name)));
      } else if (!host.modeMatches(info.mode & 0o777, record.beforeMode)) {
        await host.change(`Restore original permissions on ${name} (mode ${record.beforeMode.toString(8)}).`, () => fs.chmodSync(host.target(name), record.beforeMode));
      } else host.skip(`Original directory permissions: ${name}`);
    }
    delete host.state.directories[name];
    host.save();
  }
  await host.change(`Remove the completed installation record ${STATE_FILE} and its directory if setup created it and it is empty.`, () => {
    fs.unlinkSync(host.target(STATE_FILE));
    if (host.state.recordDirectory.created && !fs.readdirSync(host.target(STATE_DIRECTORY)).length) fs.rmdirSync(host.target(STATE_DIRECTORY));
    else if (!host.state.recordDirectory.created) fs.chmodSync(host.target(STATE_DIRECTORY), host.state.recordDirectory.previousMode);
  });
  log('Uninstall complete. Remove the deployment environment credentials from GitHub if they are no longer needed.');
}

/** Require a local root session and interactive confirmation before undoing host setup. */
async function main() {
  if (process.argv[2] === '--help' && process.argv.length === 3) {
    console.log('sudo node deploy/scripts/uninstall-self-hosted.mjs\nUndo recorded server setup changes, confirming each change.');
    return;
  }
  if (process.argv.length !== 2) throw new Error('No arguments are accepted.');
  if (process.platform !== 'linux' || process.getuid?.() !== 0) throw new Error('Run uninstall with sudo on the deployment host.');
  await withConfirmation((confirm) => uninstall({ confirm }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[uninstall] ${error.message}`); process.exitCode = 1; });
}
