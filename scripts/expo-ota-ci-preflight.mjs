import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
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
    channel: null,
    environment: null,
    environmentFile: null,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') values.help = true;
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

function readExpoProject(root) {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  return {
    appVersion: appConfig.expo?.version,
    projectId: appConfig.expo?.extra?.eas?.projectId
  };
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/expo-ota-ci-preflight.mjs [options]

Validate the EAS project, channel, and environment used by a GitHub-hosted Android update.

Options:
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
  if (!config.channel || !config.environment || !config.environmentFile) {
    throw new Error('Channel, environment, and environment file are required.');
  }
  if (!EXPO_UPDATE_CHANNEL_PATTERN.test(config.channel)) throw new Error('Invalid EAS Update channel.');

  const project = readExpoProject(root);
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
    `Runtime policy: appVersion (${project.appVersion}) | Channel: ${eas.channel} | Environment: ${config.environment}\n` +
    `Server: ${eas.serverUrl}\n` +
    'Expo OTA environment preflight passed. Expo will match the update runtime to compatible clients on this channel.\n'
  );
  return { project, eas };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runExpoOtaCiPreflight();
  } catch (error) {
    console.error(`[expo-ota-ci] ${error.message}`);
    process.exitCode = 1;
  }
}
