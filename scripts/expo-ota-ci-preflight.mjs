import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  createNativeRuntimeFingerprint,
  discoverAndroidNativePackageNames,
  EXPO_PROJECT_ID_PATTERN,
  EXPO_UPDATE_CHANNEL_PATTERN
} from './native-ota-contract.mjs';
import { parseEasEnvironmentFile } from './native-ota-update.mjs';
import { verifyNativeTagAttestation } from './native-tag-attestation.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const NATIVE_RELEASE_TAG_PATTERN = /^native-v\d+\.\d+\.\d+$/;
const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseExpoOtaCiArgs(argv) {
  const values = {
    nativeBuildRef: null,
    channel: null,
    environment: null,
    environmentFile: null,
    compatibilityOutput: null,
    readinessOutput: null,
    allowedSignersFile: null,
    environmentOnly: false,
    repositoryRoot: null,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') values.help = true;
    else if (option === '--native-build-ref') values.nativeBuildRef = requiredValue(argv, index++, option);
    else if (option === '--channel') values.channel = requiredValue(argv, index++, option);
    else if (option === '--environment') values.environment = requiredValue(argv, index++, option);
    else if (option === '--environment-file') values.environmentFile = requiredValue(argv, index++, option);
    else if (option === '--compatibility-output') values.compatibilityOutput = requiredValue(argv, index++, option);
    else if (option === '--readiness-output') values.readinessOutput = requiredValue(argv, index++, option);
    else if (option === '--allowed-signers-file') values.allowedSignersFile = requiredValue(argv, index++, option);
    else if (option === '--environment-only') values.environmentOnly = true;
    else if (option === '--repository-root') values.repositoryRoot = requiredValue(argv, index++, option);
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

export function validateNativeOtaCompatibility(baseline, current) {
  if (baseline.appVersion !== current.appVersion) {
    throw new Error(
      `Native app version changed from ${baseline.appVersion} to ${current.appVersion}. ` +
      'Create and install a new signed phone build instead of publishing OTA.'
    );
  }
  if (baseline.nativeFingerprint !== current.nativeFingerprint) {
    throw new Error(
      'Native runtime inputs changed after the installed build. Create and install a new signed phone/Watch build instead of publishing OTA.'
    );
  }
}

export function inspectNativeOtaCompatibility(baseline, current) {
  try {
    validateNativeOtaCompatibility(baseline, current);
    return { compatible: true, reason: 'compatible' };
  } catch (error) {
    if (baseline.appVersion !== current.appVersion) {
      return { compatible: false, reason: 'app-version-mismatch', message: error.message };
    }
    return { compatible: false, reason: 'native-fingerprint-mismatch', message: error.message };
  }
}

function runCommand(command, args, cwd, allowFailure = false) {
  const gitCommand = command === 'git';
  const commandArgs = gitCommand && args[0] !== '--no-replace-objects'
    ? ['--no-replace-objects', ...args]
    : args;
  const environment = gitCommand
    ? Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
      )
    : process.env;
  if (gitCommand) {
    environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : os.devNull;
    environment.GIT_CONFIG_NOSYSTEM = '1';
    environment.GIT_NO_REPLACE_OBJECTS = '1';
    environment.GIT_TERMINAL_PROMPT = '0';
    environment.LANG = 'C';
    environment.LC_ALL = 'C';
  }
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    env: environment,
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

function runGitCommand(commandRunner, args, cwd, allowFailure = false) {
  return commandRunner('git', ['--no-replace-objects', ...args], cwd, allowFailure);
}

function readPackageLock(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
}

function readExpoProject(root, nativePackageNames) {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  return {
    appVersion: appConfig.expo?.version,
    projectId: appConfig.expo?.extra?.eas?.projectId,
    nativeFingerprint: createNativeRuntimeFingerprint(root, { nativePackageNames }).sha256
  };
}

function readExpoProjectId(root) {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8'));
  return appConfig.expo?.extra?.eas?.projectId;
}

function parsePublishedNativeTagAdvertisement(stdout, tag) {
  const tagRef = `refs/tags/${tag}`;
  const peeledRef = `${tagRef}^{}`;
  const entries = new Map();
  for (const line of stdout.trim().split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!match || (match[2] !== tagRef && match[2] !== peeledRef) || entries.has(match[2])) {
      throw new Error(`Origin returned malformed or ambiguous evidence for native tag ${tag}.`);
    }
    entries.set(match[2], match[1]);
  }
  if (entries.size !== 2 || !entries.has(tagRef) || !entries.has(peeledRef)) {
    throw new Error(
      `Origin must publish ${tag} as one signed annotated native tag with an exact peeled commit.`
    );
  }
  return Object.freeze({
    tagObject: entries.get(tagRef),
    commit: entries.get(peeledRef)
  });
}

/** Resolve and attest one exact native release tag from origin, never from caller-controlled local refs. */
export function resolvePublishedNativeBuildTag(root, nativeBuildRef, options = {}) {
  if (typeof nativeBuildRef !== 'string' || !NATIVE_RELEASE_TAG_PATTERN.test(nativeBuildRef)) {
    throw new Error('Native build ref must be exactly native-vMAJOR.MINOR.PATCH.');
  }
  if (typeof options.allowedSigners !== 'string' || options.allowedSigners.length === 0) {
    throw new Error('The reviewed native tag allowed-signers file is required.');
  }
  const commandRunner = options.commandRunner ?? runCommand;
  const attestationVerifier = options.attestationVerifier ?? verifyNativeTagAttestation;
  const tagRef = `refs/tags/${nativeBuildRef}`;
  const readOrigin = () => parsePublishedNativeTagAdvertisement(
    runGitCommand(
      commandRunner,
      ['ls-remote', '--tags', 'origin', tagRef, `${tagRef}^{}`],
      root
    ).stdout,
    nativeBuildRef
  );

  const advertised = readOrigin();
  runGitCommand(
    commandRunner,
    ['fetch', '--no-tags', '--force', 'origin', `+${tagRef}:${tagRef}`],
    root
  );
  const fetchedTagObject = runGitCommand(
    commandRunner,
    ['rev-parse', '--verify', `${tagRef}^{tag}`],
    root
  ).stdout.trim();
  if (!FULL_COMMIT_SHA_PATTERN.test(fetchedTagObject) || fetchedTagObject !== advertised.tagObject) {
    throw new Error(`Fetched native tag ${nativeBuildRef} does not match the exact object advertised by origin.`);
  }

  const attestation = attestationVerifier({
    repositoryRoot: root,
    tag: nativeBuildRef,
    expectedCommit: advertised.commit,
    allowedSigners: options.allowedSigners
  });
  if (
    !attestation ||
    attestation.tag !== nativeBuildRef ||
    attestation.expectedCommit !== advertised.commit ||
    attestation.tagObject !== advertised.tagObject
  ) {
    throw new Error(`Native tag ${nativeBuildRef} returned malformed attestation evidence.`);
  }

  const finalAdvertisement = readOrigin();
  if (
    finalAdvertisement.tagObject !== advertised.tagObject ||
    finalAdvertisement.commit !== advertised.commit
  ) {
    throw new Error(`Native tag ${nativeBuildRef} changed on origin while it was being verified.`);
  }
  return Object.freeze({
    tag: nativeBuildRef,
    commit: advertised.commit,
    tagObject: advertised.tagObject,
    attestation
  });
}

/** Attest one published native baseline and bind it to the exact checked-out OTA source. */
export function verifyNativeOtaReleaseTarget(root, nativeBuildRef, options = {}) {
  const commandRunner = options.commandRunner ?? runCommand;
  const publishedTag = resolvePublishedNativeBuildTag(root, nativeBuildRef, options);
  const sourceCommit = runGitCommand(
    commandRunner,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    root
  ).stdout.trim();
  if (!FULL_COMMIT_SHA_PATTERN.test(sourceCommit)) {
    throw new Error('The selected OTA source did not resolve to a full lowercase Git commit SHA.');
  }
  const ancestry = runGitCommand(
    commandRunner,
    ['merge-base', '--is-ancestor', publishedTag.commit, sourceCommit],
    root,
    true
  );
  if (ancestry.status !== 0) {
    throw new Error('The selected update does not descend from the installed signed native release tag.');
  }
  return Object.freeze({
    sourceCommit,
    nativeBuildRef: publishedTag.tag,
    nativeBuildCommit: publishedTag.commit,
    nativeTagObject: publishedTag.tagObject
  });
}

export function resolveNpmCiInvocation(options = {}) {
  const args = ['ci', '--ignore-scripts', '--no-audit', '--fund=false'];
  const npmExecPath = Object.hasOwn(options, 'npmExecPath')
    ? options.npmExecPath
    : process.env.npm_execpath;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const platform = options.platform ?? process.platform;
  if (npmExecPath) return { command: nodeExecutable, args: [npmExecPath, ...args] };
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', ...args] };
  }
  return { command: 'npm', args };
}

/** Fingerprint both dependency trees using every native identity discovered in either tree. */
export function readNativeOtaProjectPair(currentRoot, baselineRoot, options = {}) {
  const commandRunner = options.commandRunner ?? runCommand;
  const currentLock = readPackageLock(currentRoot);
  const baselineLock = readPackageLock(baselineRoot);
  const locksDiffer = !isDeepStrictEqual(currentLock, baselineLock);
  if (locksDiffer) {
    const npm = resolveNpmCiInvocation(options);
    commandRunner(npm.command, npm.args, baselineRoot);
  }

  const currentNativePackageNames = discoverAndroidNativePackageNames(currentRoot, currentLock);
  const baselineMetadataRoot = locksDiffer ? baselineRoot : currentRoot;
  const baselineNativePackageNames = discoverAndroidNativePackageNames(baselineMetadataRoot, baselineLock);
  const nativePackageNames = new Set([
    ...currentNativePackageNames,
    ...baselineNativePackageNames
  ]);
  return {
    current: readExpoProject(currentRoot, nativePackageNames),
    baseline: readExpoProject(baselineRoot, nativePackageNames),
    nativePackageNames: [...nativePackageNames].sort(),
    installedBaselineDependencies: locksDiffer
  };
}

export function readNativeBuildProject(root, nativeBuildRef, options = {}) {
  const commandRunner = options.commandRunner ?? runCommand;
  const publishedTag = resolvePublishedNativeBuildTag(root, nativeBuildRef, options);
  const commit = publishedTag.commit;
  const ancestry = runGitCommand(
    commandRunner,
    ['merge-base', '--is-ancestor', commit, 'HEAD'],
    root,
    true
  );
  if (ancestry.status !== 0) {
    throw new Error('The selected update does not descend from the installed native build ref.');
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-expo-ota-ci-'));
  const checkout = path.join(temporaryDirectory, 'native-build');
  try {
    runGitCommand(commandRunner, ['worktree', 'add', '--detach', checkout, commit], root);
    const projects = readNativeOtaProjectPair(root, checkout, {
      ...options,
      commandRunner
    });
    return { commit, project: projects.baseline, currentProject: projects.current };
  } finally {
    runGitCommand(commandRunner, ['worktree', 'remove', '--force', checkout], root, true);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/expo-ota-ci-preflight.mjs [options]

Validate that a GitHub-hosted EAS Update is compatible with an installed Android phone build.

Options:
  --native-build-ref <tag>    Exact signed published native-vMAJOR.MINOR.PATCH installed build tag
  --channel <name>            EAS Update channel embedded in the installed build
  --environment <name>        EAS environment selected for the update
  --environment-file <path>   File produced by eas env:pull
  --compatibility-output <path>
                              Write native compatibility outputs without publishing
  --readiness-output <path>   Write attested source/native-tag identity outputs without fingerprinting
  --allowed-signers-file <path>
                              Current reviewed native-tag SSH allowed-signers file
  --environment-only          Validate only the pulled EAS environment after compatibility passed
  --repository-root <path>    Repository checkout to inspect (defaults to this checkout)
  --help                      Show this help
`);
}

function runExpoOtaCiPreflight(options = {}) {
  const config = options.config ?? parseExpoOtaCiArgs(process.argv.slice(2));
  const root = options.repositoryRoot ??
    (config.repositoryRoot ? path.resolve(config.repositoryRoot) : repositoryRoot);
  if (config.help) {
    printHelp();
    return { help: true };
  }
  if (!config.allowedSignersFile) {
    throw new Error('The current reviewed native tag allowed-signers file is required.');
  }
  const allowedSigners = fs.readFileSync(path.resolve(config.allowedSignersFile), 'utf8');
  const nativeOptions = { ...options, allowedSigners };
  if (config.environmentOnly) {
    if (config.nativeBuildRef || config.compatibilityOutput || config.readinessOutput) {
      throw new Error('Environment-only validation must not select or re-evaluate a native build ref.');
    }
    if (!config.channel || !config.environment || !config.environmentFile) {
      throw new Error('Channel, environment, and environment file are required for environment-only validation.');
    }
    if (!EXPO_UPDATE_CHANNEL_PATTERN.test(config.channel)) throw new Error('Invalid EAS Update channel.');
    const projectId = readExpoProjectId(root);
    if (!EXPO_PROJECT_ID_PATTERN.test(projectId ?? '')) {
      throw new Error('mobile/app.json does not contain a valid EAS project ID.');
    }
    const environmentValues = parseEasEnvironmentFile(
      fs.readFileSync(path.resolve(root, config.environmentFile), 'utf8')
    );
    const eas = validateEasCiEnvironment(environmentValues, {
      projectId,
      channel: config.channel,
      environment: config.environment
    });
    process.stdout.write(
      `EAS environment ${config.environment} targets project ${projectId}, channel ${eas.channel}, and ${eas.serverUrl}.\n`
    );
    return { project: { projectId }, eas };
  }
  if (config.readinessOutput) {
    if (!config.nativeBuildRef || config.compatibilityOutput) {
      throw new Error('Readiness validation requires one native build ref and cannot fingerprint compatibility.');
    }
    const releaseTarget = verifyNativeOtaReleaseTarget(root, config.nativeBuildRef, nativeOptions);
    fs.appendFileSync(
      path.resolve(config.readinessOutput),
      `source_commit=${releaseTarget.sourceCommit}\n` +
      `native_build_ref=${releaseTarget.nativeBuildRef}\n` +
      `native_build_commit=${releaseTarget.nativeBuildCommit}\n` +
      `native_tag_object=${releaseTarget.nativeTagObject}\n`
    );
    process.stdout.write(
      `Signed native build ref ${releaseTarget.nativeBuildRef} is an ancestor of exact OTA source ` +
      `${releaseTarget.sourceCommit}.\n`
    );
    return { releaseTarget };
  }
  if (config.compatibilityOutput) {
    if (!config.nativeBuildRef) {
      throw new Error('Native build ref is required for the compatibility readiness check.');
    }
    const nativeBuild = readNativeBuildProject(root, config.nativeBuildRef, nativeOptions);
    const project = nativeBuild.currentProject;
    const compatibility = inspectNativeOtaCompatibility(nativeBuild.project, project);
    fs.appendFileSync(
      path.resolve(config.compatibilityOutput),
      `native_release_compatible=${compatibility.compatible}\n` +
      `native_release_compatibility_reason=${compatibility.reason}\n`
    );
    if (compatibility.compatible) {
      process.stdout.write(
        `Native build ref ${config.nativeBuildRef} is compatible with the exact prepared source.\n`
      );
    } else {
      process.stdout.write(
        `Native build ref ${config.nativeBuildRef} is not OTA-compatible with the exact prepared source: ` +
        `${compatibility.message}\n`
      );
    }
    return { nativeBuild, project, compatibility };
  }
  if (!config.nativeBuildRef || !config.channel || !config.environment || !config.environmentFile) {
    throw new Error('Native build ref, channel, environment, and environment file are required.');
  }
  if (!EXPO_UPDATE_CHANNEL_PATTERN.test(config.channel)) throw new Error('Invalid EAS Update channel.');

  const nativeBuild = readNativeBuildProject(root, config.nativeBuildRef, nativeOptions);
  const project = nativeBuild.currentProject;
  validateNativeOtaCompatibility(nativeBuild.project, project);
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
    `Native build ref: ${config.nativeBuildRef} (${nativeBuild.commit.slice(0, 12)})\n` +
    `Runtime policy: appVersion (${project.appVersion}) | Channel: ${eas.channel} | Environment: ${config.environment}\n` +
    `Server: ${eas.serverUrl}\n` +
    `Native fingerprint: ${project.nativeFingerprint}\n` +
    'Expo OTA compatibility preflight passed.\n'
  );
  return { nativeBuild, project, eas };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runExpoOtaCiPreflight();
  } catch (error) {
    console.error(`[expo-ota-ci] ${error.message}`);
    process.exitCode = 1;
  }
}
