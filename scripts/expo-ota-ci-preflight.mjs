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

export function parseExpoOtaCiArgs(argv) {
  const values = {
    previousRef: null,
    channel: null,
    environment: null,
    environmentFile: null,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') values.help = true;
    else if (option === '--previous-ref') values.previousRef = requiredValue(argv, index++, option);
    else if (option === '--channel') values.channel = requiredValue(argv, index++, option);
    else if (option === '--environment') values.environment = requiredValue(argv, index++, option);
    else if (option === '--environment-file') values.environmentFile = requiredValue(argv, index++, option);
    else throw new Error(`Unknown Expo OTA CI option: ${option}`);
  }
  return values;
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

export function validateNativeRuntimeChange(previous, current) {
  const changed = previous.nativeFingerprint !== current.nativeFingerprint;
  if (changed && previous.appVersion === current.appVersion) {
    throw new Error(
      `Native runtime inputs changed without an app version change (${current.appVersion}). ` +
      'Increment the mobile app version and create a new signed native build before publishing OTA.'
    );
  }
  return { changed };
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

function readExpoProject(root) {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  return {
    appVersion: appConfig.expo?.version,
    projectId: appConfig.expo?.extra?.eas?.projectId,
    nativeFingerprint: createNativeRuntimeFingerprint(root).sha256
  };
}

function readPreviousExpoProject(root, previousRef) {
  if (previousRef.startsWith('-') || /^0+$/.test(previousRef)) {
    throw new Error('Previous master ref is invalid.');
  }
  const commit = runCommand('git', ['rev-parse', '--verify', `${previousRef}^{commit}`], root).stdout.trim();
  const ancestry = runCommand('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], root, true);
  if (ancestry.status !== 0) {
    throw new Error('The current update does not descend from the previous master ref.');
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-expo-ota-ci-'));
  const checkout = path.join(temporaryDirectory, 'previous-master');
  try {
    runCommand('git', ['worktree', 'add', '--detach', checkout, commit], root);
    return { commit, project: readExpoProject(checkout) };
  } finally {
    runCommand('git', ['worktree', 'remove', '--force', checkout], root, true);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/expo-ota-ci-preflight.mjs [options]

Validate native runtime changes and the EAS environment used by a GitHub-hosted Android update.

Options:
  --previous-ref <ref>        Previous master commit supplied by the push event
  --channel <name>            EAS Update channel embedded in the installed build
  --environment <name>        EAS environment selected for the update
  --environment-file <path>   File produced by eas env:pull
  --help                      Show this help
`);
}

export function runExpoOtaCiPreflight(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const config = options.config ?? parseExpoOtaCiArgs(process.argv.slice(2));
  if (config.help) {
    printHelp();
    return { help: true };
  }
  if (!config.previousRef || !config.channel || !config.environment || !config.environmentFile) {
    throw new Error('Previous ref, channel, environment, and environment file are required.');
  }
  if (!EXPO_UPDATE_CHANNEL_PATTERN.test(config.channel)) throw new Error('Invalid EAS Update channel.');

  const project = readExpoProject(root);
  const previous = readPreviousExpoProject(root, config.previousRef);
  const nativeRuntime = validateNativeRuntimeChange(previous.project, project);
  if (!EXPO_PROJECT_ID_PATTERN.test(project.projectId ?? '')) {
    throw new Error('mobile/app.json does not contain a valid EAS project ID.');
  }
  const environmentValues = parseEasEnvironmentFile(
    fs.readFileSync(path.resolve(root, config.environmentFile), 'utf8')
  );
  const eas = validateEasCiEnvironment(environmentValues, {
    projectId: project.projectId,
    channel: config.channel,
    environment: config.environment
  });

  process.stdout.write(
    `Previous master: ${previous.commit.slice(0, 12)} | Native inputs: ${nativeRuntime.changed ? 'changed with a new app version' : 'unchanged'}\n` +
    `Runtime policy: appVersion (${project.appVersion}) | Channel: ${eas.channel} | Environment: ${config.environment}\n` +
    `Server: ${eas.serverUrl}\n` +
    'Expo OTA environment preflight passed. Expo will match the update runtime to compatible clients on this channel.\n'
  );
  return { previous, project, nativeRuntime, eas };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runExpoOtaCiPreflight();
  } catch (error) {
    console.error(`[expo-ota-ci] ${error.message}`);
    process.exitCode = 1;
  }
}
