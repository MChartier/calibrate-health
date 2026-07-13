import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_SIGNING_ENV = Object.freeze([
  'CALIBRATE_ANDROID_SIGNING_STORE_FILE',
  'CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD',
  'CALIBRATE_ANDROID_SIGNING_KEY_ALIAS',
  'CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD'
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

/** Resolve and validate the shared phone/watch release environment before Gradle can start. */
export function resolveNativeReleaseEnvironment(environment, options = {}) {
  const missing = REQUIRED_SIGNING_ENV.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Native release signing is incomplete. Missing: ${missing.join(', ')}`);
  }

  const storeFile = path.resolve(options.repositoryRoot ?? repositoryRoot, environment.CALIBRATE_ANDROID_SIGNING_STORE_FILE);
  const isFile = options.fileExists ?? ((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!isFile(storeFile)) {
    throw new Error('CALIBRATE_ANDROID_SIGNING_STORE_FILE does not point to a file.');
  }

  const configuredOrigin = environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL?.trim() || 'https://calibratehealth.app';
  let serverUrl;
  try {
    serverUrl = new URL(configuredOrigin);
  } catch {
    throw new Error('EXPO_PUBLIC_CALIBRATE_SERVER_URL must be a credential-free HTTPS origin for release builds.');
  }
  if (serverUrl.protocol !== 'https:' || serverUrl.origin !== configuredOrigin) {
    throw new Error('EXPO_PUBLIC_CALIBRATE_SERVER_URL must be a credential-free HTTPS origin for release builds.');
  }

  return {
    ...environment,
    CALIBRATE_ANDROID_SIGNING_STORE_FILE: storeFile,
    EXPO_PUBLIC_CALIBRATE_SERVER_URL: serverUrl.origin,
    // Expo SDK 54 otherwise interprets Gradle's project-relative entry against the workspace root.
    EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    NODE_ENV: 'production'
  };
}

export function nativeReleaseGradleCommands(platform = process.platform) {
  const wrapper = platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const common = ['--no-daemon', '--console=plain'];
  return [
    {
      label: 'phone',
      cwd: path.join(repositoryRoot, 'mobile', 'android'),
      command: wrapper,
      args: [':app:bundleRelease', ':app:assembleRelease', ...common]
    },
    {
      label: 'wear',
      cwd: path.join(repositoryRoot, 'wear'),
      command: wrapper,
      args: [':app:bundleRelease', ':app:assembleRelease', ...common]
    }
  ];
}

export function nativeReleasePrebuildCommand(root = repositoryRoot) {
  return {
    label: 'phone prebuild',
    cwd: path.join(root, 'mobile'),
    command: process.execPath,
    args: [
      path.join(root, 'node_modules', 'expo', 'bin', 'cli'),
      'prebuild',
      '--platform',
      'android',
      '--clean',
      '--no-install'
    ]
  };
}

/** Run Gradle's wrapper jar directly on Windows so release arguments never pass through cmd.exe. */
export function nativeReleaseInvocation(build, args, environment, platform = process.platform) {
  if (platform !== 'win32') return { command: build.command, args };
  const javaExecutable = environment.JAVA_HOME?.trim()
    ? path.join(environment.JAVA_HOME, 'bin', 'java.exe')
    : 'java.exe';
  return {
    command: javaExecutable,
    args: [
      '-classpath',
      path.join(build.cwd, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
      'org.gradle.wrapper.GradleWrapperMain',
      ...args
    ]
  };
}

function run() {
  const environment = resolveNativeReleaseEnvironment(process.env);
  const prebuild = nativeReleasePrebuildCommand();
  const prebuildResult = spawnSync(prebuild.command, prebuild.args, {
    cwd: prebuild.cwd,
    env: environment,
    stdio: 'inherit'
  });
  if (prebuildResult.error) throw prebuildResult.error;
  if (prebuildResult.status !== 0) process.exit(prebuildResult.status ?? 1);

  for (const build of nativeReleaseGradleCommands()) {
    if (!fs.existsSync(path.join(build.cwd, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'))) {
      throw new Error(`${build.label} Gradle wrapper is missing. Run a clean Android prebuild before release.`);
    }
    const args = build.label === 'wear'
      ? [`-PcalibrateWearServerUrl=${environment.EXPO_PUBLIC_CALIBRATE_SERVER_URL}`, ...build.args]
      : build.args;
    const invocation = nativeReleaseInvocation(build, args, environment);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: build.cwd,
      env: environment,
      stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run();
}
