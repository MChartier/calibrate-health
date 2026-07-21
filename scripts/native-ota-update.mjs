import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createNativeRuntimeFingerprint,
  readNativeOtaBaseline
} from './native-ota-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const IGNORED_LOCAL_STATUS_PREFIXES = Object.freeze([
  '.codex-remote-attachments/',
  '.codex-screenshots/'
]);

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseNativeOtaArgs(argv) {
  const values = {
    baseline: null,
    channel: null,
    environment: null,
    message: null,
    nonInteractive: false,
    dryRun: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--non-interactive') values.nonInteractive = true;
    else if (option === '--dry-run') values.dryRun = true;
    else if (option === '--help' || option === '-h') values.help = true;
    else if (option === '--baseline') values.baseline = requiredValue(argv, index++, option);
    else if (option === '--channel') values.channel = requiredValue(argv, index++, option);
    else if (option === '--environment') values.environment = requiredValue(argv, index++, option);
    else if (option === '--message') values.message = requiredValue(argv, index++, option);
    else throw new Error(`Unknown native OTA option: ${option}`);
  }
  return values;
}

export function createNativeOtaRunner() {
  return function runCommand(request) {
    const result = spawnSync(request.command, request.args ?? [], {
      cwd: request.cwd,
      env: request.env,
      encoding: request.inherit ? undefined : 'utf8',
      stdio: request.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    if (result.error) throw result.error;
    const response = {
      status: result.status ?? 1,
      stdout: request.inherit ? '' : result.stdout ?? '',
      stderr: request.inherit ? '' : result.stderr ?? ''
    };
    if (response.status !== 0 && !request.allowFailure) {
      const detail = response.stderr.trim() || response.stdout.trim() || `exit ${response.status}`;
      throw new Error(`${request.label ?? request.command} failed: ${detail}`);
    }
    return response;
  };
}

function gitRequest(root, args, label, allowFailure = false) {
  return { command: 'git', args, cwd: root, label, allowFailure };
}

export function parseDirtyPaths(statusOutput) {
  return statusOutput.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll('\\', '/'))
    .map((file) => file.includes(' -> ') ? file.split(' -> ').at(-1) : file)
    .filter((file) => !IGNORED_LOCAL_STATUS_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

export function nativeOtaPublishCommand(config, baseline, platform = process.platform) {
  const channel = config.channel ?? baseline.channel;
  if (channel !== baseline.channel) {
    throw new Error(
      `This installed build is pinned to the ${baseline.channel} channel; rebuild it to use ${channel}.`
    );
  }
  const environment = config.environment ?? (channel === 'production' ? 'production' : 'preview');
  const args = [
    '--yes',
    'eas-cli@latest',
    'update',
    '--channel', channel,
    '--message', config.message,
    '--environment', environment,
    '--platform', 'android'
  ];
  if (config.nonInteractive) args.push('--non-interactive');
  return { command: platform === 'win32' ? 'npx.cmd' : 'npx', args, channel, environment };
}

function defaultMessage(runner, root) {
  const commit = runner(gitRequest(root, ['rev-parse', '--short', 'HEAD'], 'read current commit')).stdout.trim();
  const subject = runner(gitRequest(root, ['log', '-1', '--pretty=%s'], 'read current commit message')).stdout.trim();
  return `Calibrate ${commit}: ${subject}`;
}

function printHelp() {
  process.stdout.write(`Usage: npm run release:native:ota -- [options]

Publish an Android phone JavaScript/assets update to the channel embedded in the last local release build.

Options:
  --message <text>             Update message (default: current Git commit subject)
  --channel <name>             Must match the installed build's recorded channel
  --environment <name>         EAS environment (default: preview, or production for production channel)
  --baseline <path>            Override the recorded local native-build baseline
  --non-interactive            Require token-based EAS authentication and disable CLI prompts
  --dry-run                    Validate and print the publish command without uploading
  --help                       Show this help

Wear OS and native module/configuration changes cannot be delivered by Expo OTA.
`);
}

export function validateNativeOtaState({ root, baseline, runner, environment = process.env }) {
  const mobilePackage = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'package.json'), 'utf8'));
  if (!mobilePackage.dependencies?.['expo-updates']) {
    throw new Error('mobile/package.json does not include expo-updates. A new native build is required.');
  }

  const currentFingerprint = createNativeRuntimeFingerprint(root);
  if (currentFingerprint.sha256 !== baseline.native_fingerprint_sha256) {
    throw new Error(
      'Native runtime inputs changed after the installed build. Create and install a new signed phone/Watch build instead of publishing OTA.'
    );
  }

  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  if (appConfig.expo?.version !== baseline.runtime_version) {
    throw new Error('The Expo runtime version changed after the installed build. Create a new signed native build.');
  }

  const status = runner(gitRequest(
    root,
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'inspect OTA working tree'
  ));
  const dirtyPaths = parseDirtyPaths(status.stdout);
  if (dirtyPaths.length > 0) {
    throw new Error(`Commit OTA contents before publishing. Dirty paths: ${dirtyPaths.slice(0, 8).join(', ')}`);
  }

  if (baseline.commit) {
    const ancestry = runner(gitRequest(
      root,
      ['merge-base', '--is-ancestor', baseline.commit, 'HEAD'],
      'verify OTA descends from native build',
      true
    ));
    if (ancestry.status !== 0) {
      throw new Error('Current HEAD does not descend from the recorded native build commit. Rebuild before publishing OTA.');
    }
  }

  if (environment.EXPO_PUBLIC_EAS_PROJECT_ID &&
      environment.EXPO_PUBLIC_EAS_PROJECT_ID.trim() !== baseline.project_id) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID does not match the installed build baseline.');
  }
  return currentFingerprint;
}

export function runNativeOtaUpdate(options = {}) {
  const root = options.repositoryRoot ?? repositoryRoot;
  const environment = options.environment ?? process.env;
  const config = options.config ?? parseNativeOtaArgs(process.argv.slice(2));
  if (config.help) {
    printHelp();
    return { help: true };
  }
  const runner = options.runner ?? createNativeOtaRunner();
  const { file: baselineFile, baseline } = readNativeOtaBaseline(root, config.baseline);
  validateNativeOtaState({ root, baseline, runner, environment });
  if (config.nonInteractive && !environment.EXPO_TOKEN?.trim()) {
    throw new Error('--non-interactive requires EXPO_TOKEN. Use interactive mode to sign in with EAS CLI.');
  }

  const resolvedConfig = { ...config, message: config.message?.trim() || defaultMessage(runner, root) };
  const publish = nativeOtaPublishCommand(resolvedConfig, baseline, options.platform);
  const publishEnvironment = {
    ...environment,
    NODE_ENV: 'production',
    EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: baseline.server_url,
    EXPO_PUBLIC_EAS_PROJECT_ID: baseline.project_id,
    EXPO_UPDATES_CHANNEL: baseline.channel
  };
  process.stdout.write(
    `OTA baseline: ${baselineFile}\n` +
    `Runtime: ${baseline.runtime_version} | Channel: ${publish.channel} | Environment: ${publish.environment}\n` +
    `Native fingerprint: ${baseline.native_fingerprint_sha256}\n` +
    `Message: ${resolvedConfig.message}\n`
  );
  if (config.dryRun) {
    process.stdout.write(`Dry run: ${publish.command} ${publish.args.join(' ')}\n`);
    return { baseline, publish, dryRun: true };
  }

  runner({
    command: publish.command,
    args: publish.args,
    cwd: path.join(root, 'mobile'),
    env: publishEnvironment,
    label: 'publish Expo OTA update',
    inherit: true
  });
  process.stdout.write('Android phone OTA update published. Wear OS was not changed.\n');
  return { baseline, publish, dryRun: false };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runNativeOtaUpdate();
  } catch (error) {
    console.error(`[native-ota] ${error.message}`);
    process.exitCode = 1;
  }
}
