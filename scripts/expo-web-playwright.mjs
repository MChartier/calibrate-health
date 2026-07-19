import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createExpoWebStaticServer } from './expo-web-static-server.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const callerOwnedBaseURL = process.env.CALIBRATE_EXPO_WEB_BASE_URL?.trim();
const portText = process.env.CALIBRATE_EXPO_WEB_PORT?.trim() || '4174';
if (!/^\d+$/.test(portText)) throw new Error(`Invalid Expo web test port: ${portText}`);
const baseURL = `http://127.0.0.1:${portText}`;
const playwrightCli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const playwrightArgs = ['test', '--config', 'playwright.expo-web.config.ts', ...process.argv.slice(2)];

function runPlaywright(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, ...playwrightArgs], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

if (callerOwnedBaseURL) {
  process.exitCode = await runPlaywright(process.env);
} else {
  const build = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'expo-web-build.mjs')], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const server = createExpoWebStaticServer({ distDir: path.join(repoRoot, 'mobile', 'dist') });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(portText), '127.0.0.1', resolve);
  });
  console.log(`Expo web release test server listening at ${baseURL}`);
  try {
    process.exitCode = await runPlaywright({
      ...process.env,
      CALIBRATE_EXPO_WEB_BASE_URL: baseURL,
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}
