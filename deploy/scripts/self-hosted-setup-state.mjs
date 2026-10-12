/**
 * @file Shared host mutation tracking for deployment setup and uninstall.
 * Confirm changes, preserve original assets, and save recovery progress in a
 * root-only record; injected host operations support tests without system changes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIRECTORY = '/var/lib/calibrate-deployment-setup';
export const STATE_FILE = `${STATE_DIRECTORY}/state.json`;
export const ACCOUNT = 'calibrate-deploy';
export const ACCOUNT_HOME = '/var/lib/calibrate-deploy-user';
export const SSH_FILE = '/etc/ssh/sshd_config.d/00-calibrate-deploy.conf';

/** Run a bounded host command with a fixed environment, translating expected absence to null. */
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

/** Hash installed bytes so uninstall can identify edits made after setup. */
export const fingerprint = (value) => createHash('sha256').update(value).digest('hex');

/** Coordinate confirmed mutations and their original state across setup, reruns, and uninstall. */
export class HostChanges {
  /** Bind host adapters and load an existing record only from root-owned regular files. */
  constructor({ root = '/', ownerUid = 0, run = command, log = console.log, confirm = async () => false } = {}) {
    Object.assign(this, { root, ownerUid, log, confirm });
    /** Announce subprocess operations without logging private stdin or captured output. */
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

  /** Map a host path into the injected root used by isolated tests. */
  target(name) { return path.join(this.root, name); }
  /** Check whether an asset exists under the selected host root. */
  exists(name) { return fs.existsSync(this.target(name)); }
  /** Read a host text asset without emitting its possibly private contents. */
  read(name) { return fs.readFileSync(this.target(name), 'utf8'); }
  /** Explain why an already-correct asset requires no confirmation or write. */
  skip(description) { this.log(`[unchanged] ${description}`); }
  /** Compare POSIX permissions, allowing Windows fixtures that cannot represent those modes. */
  modeMatches(actual, expected) { return process.platform === 'win32' || actual === expected; }

  /** Reject symlinks, unexpected file types, and assets outside the trusted owner identity. */
  assertOwned(name, directory = false) {
    const info = fs.lstatSync(this.target(name));
    if (info.uid !== this.ownerUid || info.isSymbolicLink() || !(directory ? info.isDirectory() : info.isFile())) {
      throw new Error(`Expected a root-owned ${directory ? 'directory' : 'regular file'} at ${name}.`);
    }
    return info;
  }

  /** Capture original file bytes and permissions for restoration, or null for a new asset. */
  snapshot(name) {
    if (!this.exists(name)) return null;
    const info = this.assertOwned(name);
    return { data: fs.readFileSync(this.target(name)).toString('base64'), mode: info.mode & 0o777 };
  }

  /** Validate a staged temporary file before atomically replacing the destination. */
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

  /** Persist recovery state privately, skipping writes when the record has not changed. */
  save() {
    const content = `${JSON.stringify(this.state, null, 2)}\n`;
    if (!this.exists(STATE_FILE) || this.read(STATE_FILE) !== content) this.atomicWrite(STATE_FILE, content, 0o600);
  }

  /** Announce and confirm one mutation; a declined prompt stops before invoking its action. */
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

  /** Create the recovery record once, or resume setup unless uninstall is still in progress. */
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

  /** Save a resource's first observed state before mutation without overwriting it on retries. */
  remember(name, before) {
    if (!Object.hasOwn(this.state.resources, name)) this.state.resources[name] = before;
    this.save();
    return this.state.resources[name];
  }

  /** Create or adjust a directory only as needed, recording its original existence and permissions. */
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

  /** Reconcile file bytes and permissions, recording originals and pending reloads before writing. */
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

  /** Preserve an existing key's contents while correcting private-file permissions if necessary. */
  async privateFile(name) {
    const info = this.assertOwned(name);
    if (this.modeMatches(info.mode & 0o777, 0o600)) { this.skip(`Private key ${name}`); return; }
    await this.file(name, fs.readFileSync(this.target(name)), 0o600);
  }

  /** Reuse an existing SSH identity or confirm generation of a tracked Ed25519 key pair. */
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

  /** Reuse an existing WireGuard identity or confirm generation of one tracked private key. */
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

  /** Confirm and perform a pending service reload, clearing the flag only after success. */
  async reload(flag, description, binary, args) {
    if (!this.state.pending[flag]) { this.skip(description); return; }
    await this.change(description, () => {
      this.run(binary, args);
      delete this.state.pending[flag];
      this.save();
    });
  }
}

/** Provide default-no interactive confirmation and always close the terminal prompt session. */
export async function withConfirmation(action) {
  if (!process.stdin.isTTY) throw new Error('An interactive terminal is required to confirm each change.');
  const { createInterface } = await import('node:readline/promises');
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await action(async () => /^(y|yes)$/i.test((await prompts.question('Apply this change? [y/N] ')).trim()));
  } finally { prompts.close(); }
}
