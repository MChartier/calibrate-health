import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseServerRequirement } from '../shared/releaseCompatibility.ts';

const SYSTEM_ENV = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
  'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'GRADLE_USER_HOME',
  'BUNDLETOOL_JAR', 'SSH_AUTH_SOCK', 'USERNAME', 'USERDOMAIN', 'HOMEDRIVE', 'HOMEPATH',
  'PROGRAMDATA', 'ALLUSERSPROFILE', 'USER', 'LOGNAME'
]);

export function releaseEnvironment(environment = process.env, extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => SYSTEM_ENV.has(name.toUpperCase()))),
    CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    GIT_NO_REPLACE_OBJECTS: '1', ...extra
  };
}

function command(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      maxBuffer: 16 * 1024 * 1024, ...options
    })?.toString() ?? '';
  } catch {
    // Service tool errors can contain tokens and signed download URLs.
    throw new Error(path.basename(binary) + ' failed during ' + (options.label ?? 'release operation') + '.');
  }
}

export function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) throw new Error('Set ' + name + '.');
  return value;
}

export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function createReleaseContext({ root = process.cwd(), environment = process.env, run = command } = {}) {
  root = path.resolve(root);
  const safeEnv = releaseEnvironment(environment);
  const git = (args) => run('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, env: safeEnv, label: 'release source verification' }).trim();
  const sourceCommit = git(['rev-parse', 'HEAD^{commit}']);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Release requires a Git checkout.');
  if (git(['status', '--porcelain=v1', '--untracked-files=all'])) throw new Error('Commit or stash changes before publishing, including untracked files.');
  const remote = git(['remote', 'get-url', 'origin']);
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error('origin must identify a GitHub repository without embedded credentials.');
  const manifest = readJson(path.join(root, 'shared/release.json'));
  const client = readJson(path.join(root, 'shared/client-release.json'));
  if (!parseServerRequirement(client.requiresServer)) throw new Error('shared/client-release.json requiresServer must be an explicit >=X.Y.Z <X.Y.Z range.');
  const stateRoot = path.resolve(environment.CALIBRATE_RELEASE_STATE_DIR || path.join(root, '.local-release'));
  return { root, environment, safeEnv, run, git, sourceCommit, repository: match[1], manifest, client, stateRoot };
}

export function publicBuildEnvironment(context, channel) {
  const projectId = required(context.environment, 'EXPO_PUBLIC_EAS_PROJECT_ID');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('Expo project ID must be a UUID.');
  const serverUrl = required(context.environment, 'EXPO_PUBLIC_CALIBRATE_SERVER_URL');
  const url = new URL(serverUrl);
  if (url.protocol !== 'https:' || url.origin !== serverUrl || url.username || url.password) throw new Error('Server URL must be a credential-free HTTPS origin.');
  return { EXPO_PUBLIC_EAS_PROJECT_ID: projectId, EXPO_PUBLIC_CALIBRATE_SERVER_URL: serverUrl,
    EXPO_UPDATES_CHANNEL: channel, NODE_ENV: 'production' };
}

export async function withReleaseLock(context, operation) {
  fs.mkdirSync(context.stateRoot, { recursive: true });
  const file = path.join(context.stateRoot, 'release.lock');
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch { throw new Error('Another release owns ' + file + '. After a crash, verify that process stopped before removing the lock.'); }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, sourceCommit: context.sourceCommit }));
  try { return await operation(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file); }
}
