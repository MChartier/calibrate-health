import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createNativeRuntimeFingerprint,
  EXPO_PROJECT_ID_PATTERN,
  EXPO_UPDATE_CHANNEL_PATTERN
} from './native-ota-contract.mjs';
import { parseEasEnvironmentFile } from './native-ota-update.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseNativeOtaCiArgs(argv) {
  const values = {
    nativeBuildRef: null,
    channel: null,
    environment: null,
    environmentFile: null,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') values.help = true;
    else if (option === '--native-build-ref') values.nativeBuildRef = requiredValue(argv, index++, option);
    else if (option === '--channel') values.channel = requiredValue(argv, index++, option);
    else if (option === '--environment') values.environment = requiredValue(argv, index++, option);
    else if (option === '--environment-file') values.environmentFile = requiredValue(argv, index++, option);
    else throw new Error(`Unknown native OTA CI option: ${option}`);
  }
  return values;
}

export function validateNativeOtaCompatibility(baseline, current) {
  if (baseline.runtimeVersion !== current.runtimeVersion) {
    throw new Error(
      `Native runtime version changed from ${baseline.runtimeVersion} to ${current.runtimeVersion}. ` +
      'Create and install a new signed phone build instead of publishing OTA.'
    );
  }
  if (baseline.fingerprint !== current.fingerprint) {
    throw new Error(
      'Native runtime inputs changed after the installed build. Create and install a new signed phone/Watch build instead of publishing OTA.'
    );
  }
}

export function validateEasCiEnvironment(values, expected) {
  const projectId = values.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(`EAS environment ${expected.environment} does not define EXPO_PUBLIC_EAS_PROJECT_ID.`);
  }
  if (projectId !== expected.projectId) {
    throw new Error(
      `EAS environment ${expected.environment} targets project ${projectId}, but mobile/app.json targets ${expected.projectId}.`
    );
  }

  const channel = values.EXPO_UPDATES_CHANNEL?.trim();
  if (!channel) {
    throw new Error(`EAS environment ${expected.environment} does not define EXPO_UPDATES_CHANNEL.`);
  }
  if (channel !== expected.channel) {
    throw new Error(
      `EAS environment ${expected.environment} targets channel ${channel}, but this dispatch targets ${expected.channel}.`
    );
  }

  const serverUrl = values.EXPO_PUBLIC_CALIBRATE_SERVER_URL?.trim();
  if (!serverUrl) {
    throw new Error(`EAS environment ${expected.environment} does not define EXPO_PUBLIC_CALIBRATE_SERVER_URL.`);
  }
  let parsedServerUrl;
  try {
    parsedServerUrl = new URL(serverUrl);
  } catch {
    throw new Error(`EAS environment ${expected.environment} has an invalid Calibrate server URL.`);
  }
  if (parsedServerUrl.protocol !== 'https:') {
    throw new Error(`EAS environment ${expected.environment} must use an HTTPS Calibrate server URL.`);
  }
  if (parsedServerUrl.username || parsedServerUrl.password) {
    throw new Error(`EAS environment ${expected.environment} must not put credentials in the Calibrate server URL.`);
  }
  return { projectId, channel, serverUrl };
}

function runCommand(command, args, cwd, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0 && !allowFailure) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    throw new Error(`${command} ${args[0] ?? ''} failed: ${detail}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function readRuntimeContract(root) {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  return {
    runtimeVersion: appConfig.expo?.version,
    projectId: appConfig.expo?.extra?.eas?.projectId,
    fingerprint: createNativeRuntimeFingerprint(root).sha256
  };
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/native-ota-ci-preflight.mjs [options]

Validate that a GitHub-hosted EAS Update is compatible with an installed Android phone build.

Options:
  --native-build-ref <ref>    Exact commit or tag used to create the installed native build
  --channel <name>            EAS Update channel embedded in the installed build
  --environment <name>        EAS environment selected for the update
  --environment-file <path>   File produced by eas env:pull
  --help                      Show this help
`);
}

export function runNativeOtaCiPreflight(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const config = options.config ?? parseNativeOtaCiArgs(process.argv.slice(2));
  if (config.help) {
    printHelp();
    return { help: true };
  }
  if (!config.nativeBuildRef || !config.channel || !config.environment || !config.environmentFile) {
    throw new Error('Native build ref, channel, environment, and environment file are required.');
  }
  if (config.nativeBuildRef.startsWith('-')) throw new Error('Native build ref must not start with a dash.');
  if (!EXPO_UPDATE_CHANNEL_PATTERN.test(config.channel)) throw new Error('Invalid EAS Update channel.');

  const commit = runCommand(
    'git',
    ['rev-parse', '--verify', `${config.nativeBuildRef}^{commit}`],
    root
  ).stdout.trim();
  const ancestry = runCommand('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], root, true);
  if (ancestry.status !== 0) {
    throw new Error('The selected update does not descend from the installed native build ref.');
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-native-ota-ci-'));
  const checkout = path.join(temporaryDirectory, 'native-build');
  try {
    runCommand('git', ['worktree', 'add', '--detach', checkout, commit], root);
    const baseline = readRuntimeContract(checkout);
    const current = readRuntimeContract(root);
    validateNativeOtaCompatibility(baseline, current);
    if (!EXPO_PROJECT_ID_PATTERN.test(current.projectId ?? '')) {
      throw new Error('mobile/app.json does not contain a valid EAS project ID.');
    }

    const environmentValues = parseEasEnvironmentFile(
      fs.readFileSync(path.resolve(root, config.environmentFile), 'utf8')
    );
    const eas = validateEasCiEnvironment(environmentValues, {
      projectId: current.projectId,
      channel: config.channel,
      environment: config.environment
    });

    process.stdout.write(
      `Native build ref: ${config.nativeBuildRef} (${commit.slice(0, 12)})\n` +
      `Runtime: ${current.runtimeVersion} | Channel: ${eas.channel} | Environment: ${config.environment}\n` +
      `Server: ${eas.serverUrl}\n` +
      `Native fingerprint: ${current.fingerprint}\n` +
      'OTA compatibility preflight passed.\n'
    );
    return { commit, baseline, current, eas };
  } finally {
    runCommand('git', ['worktree', 'remove', '--force', checkout], root, true);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runNativeOtaCiPreflight();
  } catch (error) {
    console.error(`[native-ota-ci] ${error.message}`);
    process.exitCode = 1;
  }
}
