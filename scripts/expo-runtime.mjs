/** Resolve the same managed Expo runtime for native builds and credential-free OTA exports. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Autolinking errors can produce a hash of an empty graph; such a hash is not a usable runtime. */
export function validateRuntimeResolution(value) {
  if (!/^[a-f0-9]{40,64}$/.test(value.runtimeVersion ?? '')) throw new Error('Expo must resolve a fingerprint runtime.');
  const sources = value.fingerprintSources ?? [];
  const expo = JSON.parse(sources.find((source) => source.id === 'expoAutolinkingConfig:android')?.contents ?? '{}');
  const native = JSON.parse(sources.find((source) => source.id === 'rncoreAutolinkingConfig:android')?.contents ?? '{}');
  for (const name of ['expo-updates', '@calibrate/wear-pairing']) {
    if (!expo.modules?.some((module) => module.packageName === name)) throw new Error(`Incomplete Expo native discovery: ${name}.`);
  }
  if (!native['react-native-health-connect']) throw new Error('Incomplete React Native module discovery.');
  return value.runtimeVersion;
}

/** Use the installed SDK resolver; generated CNG directories must not change the runtime. */
export function resolveExpoRuntime(root, { environment = process.env, execute = spawnSync } = {}) {
  const require = createRequire(path.join(root, 'mobile', 'package.json'));
  const resolver = path.join(path.dirname(require.resolve('expo-updates/package.json')), 'bin', 'cli');
  const env = { ...environment, NODE_ENV: 'production', EXPO_NO_DOTENV: '1', EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    EXPO_UPDATES_WORKFLOW_OVERRIDE: 'managed', EXPO_UPDATES_FINGERPRINT_OVERRIDE: '' };
  for (const key of Object.keys(env)) {
    if (/^(EXPO_TOKEN|GITHUB_TOKEN|GH_TOKEN|DEPLOY_|CALIBRATE_ANDROID_|GOOGLE_|PLAY_)/.test(key)) delete env[key];
  }
  const result = execute(process.execPath, [resolver, 'runtimeversion:resolve', '--platform', 'android', '--workflow', 'managed'], {
    cwd: path.join(root, 'mobile'), env,
    encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error(`Expo runtime resolution failed: ${result.stderr || result.error}`);
  const value = JSON.parse(result.stdout);
  return validateRuntimeResolution(value);
}

/** Write a small runtime artifact without admitting Expo authentication to source evaluation. */
function main() {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw new Error('Usage: expo-runtime.mjs <repository-root> <output.json>');
  writeFileSync(output, `${JSON.stringify({ runtimeVersion: resolveExpoRuntime(path.resolve(root)) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
