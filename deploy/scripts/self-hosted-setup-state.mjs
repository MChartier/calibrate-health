import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIRECTORY = '/var/lib/calibrate-deployment-setup';
export const STATE_FILE = `${STATE_DIRECTORY}/state.json`;
export const ACCOUNT = 'calibrate-deploy';
export const ACCOUNT_HOME = '/var/lib/calibrate-deploy-user';
export const FIREWALL_SERVICE = 'calibrate-ci-firewall.service';
export const SSH_FILE = '/etc/ssh/sshd_config.d/00-calibrate-deploy.conf';
export const FIREWALL_FILE = '/etc/calibrate/ci-firewall.nft';

export function command(binary, args, { input, absent = false, missingCodes = [1] } = {}) {
  try {
    return execFileSync(binary, args, {
      input, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_CONFIG: '/etc/calibrate/registry' },
    }).trim();
  } catch (error) {
    if (absent && missingCodes.includes(error.status)) return null;
    throw new Error(`${binary} ${args[0]} failed. Inspect that service locally; private command output was withheld.`);
  }
}

export const fingerprint = (value) => createHash('sha256').update(value).digest('hex');

export class HostChanges {
  constructor({ root = '/', ownerUid = 0, run = command, log = console.log, confirm = async () => false } = {}) {
    Object.assign(this, { root, ownerUid, log, confirm });
    this.run = (binary, args, options) => {
      log(`[run] ${binary} ${args.join(' ')}`);
      return run(binary, args, options);
    };
    this.state = null;
    if (this.exists(STATE_FILE)) {
      this.assertOwned(STATE_DIRECTORY, true);
      this.assertOwned(STATE_FILE);
      this.state = JSON.parse(this.read(STATE_FILE));
      if (this.state.version !== 1) throw new Error('Unsupported installation record version.');
    }
  }

  target(name) { return path.join(this.root, name); }
  exists(name) { return fs.existsSync(this.target(name)); }
  read(name) { return fs.readFileSync(this.target(name), 'utf8'); }
  skip(description) { this.log(`[unchanged] ${description}`); }
  modeMatches(actual, expected) { return process.platform === 'win32' || actual === expected; }

  assertOwned(name, directory = false) {
    const info = fs.lstatSync(this.target(name));
    if (info.uid !== this.ownerUid || info.isSymbolicLink() || !(directory ? info.isDirectory() : info.isFile())) {
      throw new Error(`Expected a root-owned ${directory ? 'directory' : 'regular file'} at ${name}.`);
    }
    return info;
  }

  snapshot(name) {
    if (!this.exists(name)) return null;
    const info = this.assertOwned(name);
    return { data: fs.readFileSync(this.target(name)).toString('base64'), mode: info.mode & 0o777 };
  }

  atomicWrite(name, content, mode, validate) {
    if (this.exists(name)) this.assertOwned(name);
    const destination = this.target(name);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, content, { mode, flag: 'wx' });
    try {
      fs.chmodSync(temporary, mode);
      validate?.(temporary);
      fs.renameSync(temporary, destination);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  save() {
    const content = `${JSON.stringify(this.state, null, 2)}\n`;
    if (!this.exists(STATE_FILE) || this.read(STATE_FILE) !== content) this.atomicWrite(STATE_FILE, content, 0o600);
  }

  async change(description, action) {
    this.log(`[change] ${description}`);
    if (await this.confirm(description) !== true) {
      this.log('[stopped] Change declined. Earlier approved changes are retained; rerun setup or uninstall to continue.');
      throw new Error('Cancelled before the proposed change.');
    }
    if (this.uninstalling && this.state) { this.state.phase = 'uninstalling'; this.save(); }
    const result = await action();
    this.log(`[done] ${description}`);
    return result;
  }

  async initialize() {
    if (this.state) {
      if (this.state.phase === 'uninstalling') throw new Error('Finish the interrupted uninstall before running setup again.');
      this.skip('Reusing the installation record.');
      return;
    }
    if (this.exists(STATE_DIRECTORY)) {
      this.assertOwned(STATE_DIRECTORY, true);
      if (fs.readdirSync(this.target(STATE_DIRECTORY)).length) throw new Error(`Unrecognized files in ${STATE_DIRECTORY}.`);
    }
    await this.change(`Create the root-only installation record at ${STATE_DIRECTORY}; each approved change also records its uninstall information.`, () => {
      const created = !this.exists(STATE_DIRECTORY);
      const previousMode = created ? null : fs.statSync(this.target(STATE_DIRECTORY)).mode & 0o777;
      if (created) fs.mkdirSync(this.target(STATE_DIRECTORY), { mode: 0o700 });
      fs.chmodSync(this.target(STATE_DIRECTORY), 0o700);
      this.state = { version: 1, phase: 'installed', recordDirectory: { created, previousMode }, files: {}, directories: {}, resources: {}, pending: {} };
      this.save();
    });
  }

  remember(name, before) {
    if (!Object.hasOwn(this.state.resources, name)) this.state.resources[name] = before;
    this.save();
    return this.state.resources[name];
  }

  async directory(name, mode = 0o700, preserveExisting = false) {
    const info = this.exists(name) ? this.assertOwned(name, true) : null;
    if (info && (preserveExisting || this.modeMatches(info.mode & 0o777, mode))) {
      this.skip(`Directory ${name}`);
      return;
    }
    if (!fs.existsSync(path.dirname(this.target(name)))) throw new Error(`Missing parent directory for ${name}.`);
    await this.change(`${info ? 'Set permissions on' : 'Create'} directory ${name} (mode ${mode.toString(8)}).`, () => {
      this.state.directories[name] ??= { beforeMode: info ? info.mode & 0o777 : null };
      this.save();
      if (!info) fs.mkdirSync(this.target(name), { mode });
      fs.chmodSync(this.target(name), mode);
    });
  }

  async file(name, content, mode = 0o600, pending = [], validate) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const before = this.snapshot(name);
    if (before && Buffer.from(before.data, 'base64').equals(bytes) && this.modeMatches(before.mode, mode)) {
      this.skip(`File ${name}`);
      return false;
    }
    await this.change(`${before ? 'Update' : 'Create'} ${name} (mode ${mode.toString(8)}).`, () => {
      this.state.files[name] ??= { before };
      this.state.files[name].after = fingerprint(bytes);
      for (const flag of pending) this.state.pending[flag] = true;
      this.save();
      this.atomicWrite(name, bytes, mode, validate);
    });
    return true;
  }

  async privateFile(name) {
    const info = this.assertOwned(name);
    if (this.modeMatches(info.mode & 0o777, 0o600)) { this.skip(`Private key ${name}`); return; }
    await this.file(name, fs.readFileSync(this.target(name)), 0o600);
  }

  async sshKey(name) {
    if (this.exists(name)) { await this.privateFile(name); return; }
    if (this.exists(`${name}.pub`)) throw new Error(`Public key exists without its private key: ${name}.pub`);
    await this.change(`Generate the SSH key pair ${name} and ${name}.pub.`, () => {
      for (const file of [name, `${name}.pub`]) this.state.files[file] ??= { before: null, after: null };
      this.save();
      this.run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'calibrate-ci', '-f', this.target(name)]);
      for (const file of [name, `${name}.pub`]) {
        this.assertOwned(file);
        this.state.files[file].after = fingerprint(fs.readFileSync(this.target(file)));
      }
      this.save();
    });
  }

  async wireGuardKey(name) {
    if (this.exists(name)) { await this.privateFile(name); return; }
    await this.change(`Generate the WireGuard private key ${name}.`, () => {
      this.state.files[name] ??= { before: null, after: null };
      this.save();
      const key = this.run('wg', ['genkey']);
      if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error('WireGuard did not generate a valid private key.');
      const content = `${key}\n`;
      this.atomicWrite(name, content, 0o600);
      this.state.files[name].after = fingerprint(content);
      this.save();
    });
  }

  serviceStatus() {
    const query = (operation) => this.run('systemctl', [operation, FIREWALL_SERVICE], { absent: true, missingCodes: [1, 3, 4] });
    return { active: query('is-active') === 'active', enabled: query('is-enabled') === 'enabled' };
  }

  async reload(flag, description, binary, args) {
    if (!this.state.pending[flag]) { this.skip(description); return; }
    await this.change(description, () => {
      this.run(binary, args);
      delete this.state.pending[flag];
      this.save();
    });
  }
}

export async function withConfirmation(action) {
  if (!process.stdin.isTTY) throw new Error('An interactive terminal is required to confirm each change.');
  const { createInterface } = await import('node:readline/promises');
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await action(async () => /^(y|yes)$/i.test((await prompts.question('Apply this change? [y/N] ')).trim()));
  } finally { prompts.close(); }
}
