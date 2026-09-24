import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { INTERNAL_PROJECT_ID, loadLocalSigningEnvironment, requireExternalFile } from './native-internal-release.mjs';
import { NATIVE_RELEASE_APPLICATION_ID } from './native-release-evidence.mjs';
import { ensureNativeEasDependency, nativeSetupEnvironment } from './native-setup.mjs';
import { resolveLockedEasCliInvocation } from './native-ota-update.mjs';
import { createGoogleServiceAccountAssertion } from './native-play-release.mjs';

const FILE_OPTIONS = {
  '--credentials-file': 'credentialsFile',
  '--service-account-file': 'serviceAccountFile'
};
const CONFIG_FIELDS = ['schemaVersion', ...Object.values(FILE_OPTIONS)];

export function nativeConfigurationPath(environment = process.env, platform = process.platform) {
  const base = platform === 'win32'
    ? environment.LOCALAPPDATA
    : environment.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  if (!base || !path.isAbsolute(base)) throw new Error('Native configuration requires an absolute user configuration directory (LOCALAPPDATA on Windows).');
  return path.join(base, 'calibrate-health', 'native.json');
}

export function parseNativeConfigureArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const field = option === '--service-account-file' ? 'serviceAccountFile' : null;
    if (!field || Object.hasOwn(values, field)) throw new Error('Unknown or duplicate configure option: ' + option);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(option + ' requires a value.');
    values[field] = value;
  }
  return values;
}

function externalConfigurationPath(root, environment, platform) {
  const requested = nativeConfigurationPath(environment, platform);
  let existing = requested;
  const suffix = [];
  while (!fs.existsSync(existing)) {
    suffix.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error('Native configuration directory is unavailable.');
    existing = parent;
  }
  const resolved = path.join(fs.realpathSync(existing), ...suffix);
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Native machine configuration must be outside the repository.');
  }
  return resolved;
}

export function readNativeConfiguration({ root, environment = process.env, platform = process.platform }) {
  const file = externalConfigurationPath(root, environment, platform);
  let contents;
  try { contents = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { file, config: { schemaVersion: 1 } };
    throw new Error('Cannot read native machine configuration. Check access to ' + file + '.');
  }
  let config;
  try { config = JSON.parse(contents); }
  catch { throw new Error('Invalid native machine configuration JSON. Run native:configure -- --service-account-file <play-json> to replace it.'); }
  if (config?.schemaVersion !== 1 || Object.keys(config).some((key) => !CONFIG_FIELDS.includes(key)) ||
      Object.values(FILE_OPTIONS).some((field) => Object.hasOwn(config, field) &&
        (typeof config[field] !== 'string' || !path.isAbsolute(config[field])))) {
    throw new Error('Invalid native machine configuration. Run native:configure -- --service-account-file <play-json> to replace it.');
  }
  return { file, config };
}

function credentialProject(root) {
  const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'mobile/app.json'), 'utf8'));
  if (expo?.android?.package !== NATIVE_RELEASE_APPLICATION_ID || expo.extra?.eas?.projectId !== INTERNAL_PROJECT_ID ||
      expo.owner !== 'calibrate-health' || expo.slug !== 'calibrate-health-app') {
    throw new Error('Native credentials require the linked Calibrate EAS project and net.darkmachines.healthtracker package.');
  }
  // A minimal external project keeps downloads out of the checkout and ignores stale generated Android files.
  return { expo: {
    name: expo.name, slug: expo.slug, owner: expo.owner, android: { package: expo.android.package },
    extra: { eas: { projectId: expo.extra.eas.projectId } }
  } };
}

function runEasCredentials(root, args, directory, environment) {
  const invocation = resolveLockedEasCliInvocation(root, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: directory, env: environment, stdio: 'inherit', windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error('EAS credential configuration did not complete. Saved native settings are unchanged.');
}

function removeCredentialAttempt(parent, directory) {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(directory));
  if (path.dirname(relative) !== '.' || !relative.startsWith('eas-android-')) {
    throw new Error('Refusing to remove a directory outside native credential staging.');
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

function downloadSigningCredentials(root, parent, environment, options) {
  const project = credentialProject(root);
  const safe = nativeSetupEnvironment(environment);
  const npmCli = environment.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  // Install only the locked CLI here so configure can precede Android SDK setup.
  (options.ensureEas ?? ensureNativeEasDependency)(root, npmCli, safe);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(parent, 'eas-android-'));
  fs.chmodSync(directory, 0o700);
  try {
    const writeJson = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    writeJson('app.json', project);
    writeJson('package.json', { name: 'calibrate-native-credentials', version: '1.0.0', private: true });
    writeJson('eas.json', { cli: { appVersionSource: 'local' }, build: {
      internal: { credentialsSource: 'remote', distribution: 'internal' }
    } });
    const easEnvironment = { ...safe, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: directory, EXPO_NO_DOTENV: '1' };
    if (environment.EXPO_TOKEN) easEnvironment.EXPO_TOKEN = environment.EXPO_TOKEN;
    const run = options.runEas ?? runEasCredentials;
    const log = options.log ?? console.log;
    log('[native] EAS signing credentials for @calibrate-health/calibrate-health-app / ' + NATIVE_RELEASE_APPLICATION_ID + '.');
    run(root, ['credentials:configure-build', '--platform', 'android', '--profile', 'internal'], directory, easEnvironment);
    log('[native] In EAS, choose internal, then credentials.json > Download credentials from EAS to credentials.json. After downloading, choose Go back, then Exit.');
    run(root, ['credentials', '--platform', 'android'], directory, easEnvironment);
    const file = path.join(directory, 'credentials.json');
    let downloaded;
    try { downloaded = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('EAS did not download valid credentials.json. Rerun native:configure and choose Download credentials from EAS to credentials.json.'); }
    const signing = downloaded?.android?.keystore;
    if (typeof signing?.keystorePath !== 'string' || !signing.keystorePath) throw new Error('EAS download is missing the Android keystore path.');
    signing.keystorePath = requireExternalFile(root, path.resolve(directory, signing.keystorePath), 'EAS upload keystore');
    signing.keyPassword ??= signing.keystorePassword;
    // EAS writes relative paths; the local build worker requires an absolute external path.
    writeJson('credentials.json', { android: { keystore: signing } });
    fs.chmodSync(file, 0o600);
    fs.chmodSync(signing.keystorePath, 0o600);
    loadLocalSigningEnvironment(root, file, {});
    return { file, directory };
  } catch (error) {
    removeCredentialAttempt(parent, directory);
    throw error;
  }
}

export function configureNative(values, options) {
  const { root, environment = process.env, platform = process.platform } = options;
  // Signing is refreshed from EAS, so an explicit Play path replaces all saved fields.
  const stored = values.serviceAccountFile
    ? { file: externalConfigurationPath(root, environment, platform), config: { schemaVersion: 1 } }
    : readNativeConfiguration({ root, environment, platform });
  const config = { ...stored.config };
  if (values.serviceAccountFile) {
    config.serviceAccountFile = requireExternalFile(root, values.serviceAccountFile, 'Play testing service account');
    let credentials;
    try { credentials = JSON.parse(fs.readFileSync(config.serviceAccountFile, 'utf8')); }
    catch { throw new Error('Google Play service-account file is missing or invalid JSON.'); }
    // Exercise the publisher's key/JSON validation locally without exchanging a token or calling Play.
    createGoogleServiceAccountAssertion(credentials);
  }

  const directory = path.dirname(stored.file);
  const downloaded = downloadSigningCredentials(root, directory, environment, options);
  config.credentialsFile = downloaded.file;
  const temporary = path.join(directory, '.native-config-' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, stored.file);
  } catch (error) {
    removeCredentialAttempt(directory, downloaded.directory);
    throw error;
  } finally { fs.rmSync(temporary, { force: true }); }
  return { configurationFile: stored.file, ...config };
}

export function resolveNativeCredentialFile(field, override, options) {
  const file = override || readNativeConfiguration(options).config[field];
  const option = Object.keys(FILE_OPTIONS).find((key) => FILE_OPTIONS[key] === field);
  if (!file) throw new Error(field === 'credentialsFile'
    ? 'No EAS signing credentials configured. Run npm run native:configure to download them.'
    : 'No local ' + option + ' configured. Run npm run native:configure -- ' + option + ' <file>.');
  // Resolve/inspect only the path here. The consuming worker controls when secret contents are loaded.
  return requireExternalFile(options.root, file, field === 'credentialsFile' ? 'credentials.json' : 'Play testing service account');
}
