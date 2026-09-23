import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadLocalSigningEnvironment, requireExternalFile } from './native-internal-release.mjs';
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
    const field = Object.hasOwn(FILE_OPTIONS, option) ? FILE_OPTIONS[option] : null;
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
  catch { throw new Error('Invalid native machine configuration JSON. Run native:configure with both credential-file options to replace it.'); }
  if (config?.schemaVersion !== 1 || Object.keys(config).some((key) => !CONFIG_FIELDS.includes(key)) ||
      Object.values(FILE_OPTIONS).some((field) => Object.hasOwn(config, field) &&
        (typeof config[field] !== 'string' || !path.isAbsolute(config[field])))) {
    throw new Error('Invalid native machine configuration. Run native:configure with both credential-file options to replace it.');
  }
  return { file, config };
}

export function configureNative(values, options) {
  const { root, environment = process.env, platform = process.platform } = options;
  // Supplying both paths can repair a corrupt settings file without reading its contents.
  const stored = values.credentialsFile && values.serviceAccountFile
    ? { file: externalConfigurationPath(root, environment, platform), config: { schemaVersion: 1 } }
    : readNativeConfiguration({ root, environment, platform });
  const config = { ...stored.config };
  if (Object.keys(values).length === 0) return { configurationFile: stored.file, ...config };

  if (values.credentialsFile) {
    config.credentialsFile = requireExternalFile(root, values.credentialsFile, 'credentials.json');
    // Configure validates locally; builds still admit signing only after credential-free preparation.
    loadLocalSigningEnvironment(root, config.credentialsFile, {});
  }
  if (values.serviceAccountFile) {
    config.serviceAccountFile = requireExternalFile(root, values.serviceAccountFile, 'Play testing service account');
    let credentials;
    try { credentials = JSON.parse(fs.readFileSync(config.serviceAccountFile, 'utf8')); }
    catch { throw new Error('Google Play service-account file is missing or invalid JSON.'); }
    // Exercise the publisher's key/JSON validation locally without exchanging a token or calling Play.
    createGoogleServiceAccountAssertion(credentials);
  }

  const directory = path.dirname(stored.file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, '.native-config-' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, stored.file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return { configurationFile: stored.file, ...config };
}

export function resolveNativeCredentialFile(field, override, options) {
  const file = override || readNativeConfiguration(options).config[field];
  const option = Object.keys(FILE_OPTIONS).find((key) => FILE_OPTIONS[key] === field);
  if (!file) throw new Error('No local ' + option + ' configured. Run npm run native:configure -- ' + option + ' <file>.');
  // Resolve/inspect only the path here. The consuming worker controls when secret contents are loaded.
  return requireExternalFile(options.root, file, field === 'credentialsFile' ? 'credentials.json' : 'Play testing service account');
}
