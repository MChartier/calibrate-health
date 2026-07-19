import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { enhanceExpoWebServiceWorker, inspectExpoWebExport } from './expo-web-release.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = path.join(repoRoot, 'mobile');
const distDir = path.join(mobileDir, 'dist');
const expoCli = path.join(repoRoot, 'node_modules', 'expo', 'bin', 'cli');
const mobileNodeModules = path.join(mobileDir, 'node_modules');

// The generated directory is fixed and asserted before cleanup so stale hashed bundles cannot ship.
if (path.dirname(distDir) !== mobileDir || path.basename(distDir) !== 'dist') {
  throw new Error(`Refusing to clean unexpected Expo output directory: ${distDir}`);
}
fs.rmSync(distDir, { recursive: true, force: true });

const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web'], {
  cwd: mobileDir,
  // Expo CLI is hoisted by npm workspaces while Router may remain app-local.
  env: {
    ...process.env,
    NODE_PATH: [mobileNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  },
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

enhanceExpoWebServiceWorker(distDir);
const artifact = inspectExpoWebExport(distDir);
console.log(
  `Built Expo web ${artifact.exportMode} release artifact: ${artifact.bundleCount} reachable bundles; ` +
  `${artifact.precacheCount} precached paths.`,
);
