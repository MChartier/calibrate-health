import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const collectInitialFiles = (manifest, entryKey) => {
  const files = new Set();
  const pending = [entryKey];
  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || files.has(key)) continue;
    files.add(key);
    pending.push(...(manifest[key]?.imports ?? []));
  }
  return [...files].map((key) => manifest[key]?.file).filter(Boolean);
};

const sizeFile = async (distDir, relativePath) => {
  const contents = await readFile(path.join(distDir, relativePath));
  return { file: relativePath, bytes: contents.byteLength, gzip_bytes: gzipSync(contents).byteLength };
};

/** Measure the initial and async JavaScript graphs emitted by Vite. */
export async function measureFrontendBuild(distDir) {
  const manifest = await readJson(path.join(distDir, '.vite', 'manifest.json'));
  const entries = Object.entries(manifest).filter(([, value]) => value.isEntry);
  if (entries.length !== 1) throw new Error(`Expected one frontend entry, found ${entries.length}.`);

  const [entryKey] = entries[0];
  const initialFiles = collectInitialFiles(manifest, entryKey).filter((file) => file.endsWith('.js'));
  const allJavaScriptFiles = [...new Set(Object.values(manifest).map((value) => value.file).filter((file) => file.endsWith('.js')))];
  const initial = await Promise.all(initialFiles.map((file) => sizeFile(distDir, file)));
  const initialSet = new Set(initialFiles);
  const asyncChunks = await Promise.all(allJavaScriptFiles.filter((file) => !initialSet.has(file)).map((file) => sizeFile(distDir, file)));
  const serviceWorkerBytes = (await stat(path.join(distDir, 'service-worker.js'))).size;

  return {
    initial,
    async: asyncChunks.sort((left, right) => right.bytes - left.bytes),
    initial_javascript_bytes: initial.reduce((sum, chunk) => sum + chunk.bytes, 0),
    initial_javascript_gzip_bytes: initial.reduce((sum, chunk) => sum + chunk.gzip_bytes, 0),
    largest_async_javascript_bytes: asyncChunks[0]?.bytes ?? 0,
    service_worker_bytes: serviceWorkerBytes,
  };
}

export function evaluateBudgets(measurements, budgets) {
  return Object.entries(budgets).flatMap(([metric, limit]) => {
    const actual = measurements[metric];
    if (!Number.isSafeInteger(limit) || limit <= 0) return [`${metric} has an invalid budget: ${limit}.`];
    if (!Number.isSafeInteger(actual)) return [`${metric} was not measured.`];
    return actual > limit ? [`${metric} is ${actual} bytes; budget is ${limit} bytes.`] : [];
  });
}

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

export function formatReport(measurements, budgets) {
  const rows = Object.keys(budgets).map((metric) => {
    const actual = measurements[metric];
    const limit = budgets[metric];
    return `${metric}: ${formatBytes(actual)} / ${formatBytes(limit)} (${((actual / limit) * 100).toFixed(1)}%)`;
  });
  const chunks = measurements.initial
    .sort((left, right) => right.bytes - left.bytes)
    .map((chunk) => `  ${chunk.file}: ${formatBytes(chunk.bytes)} (${formatBytes(chunk.gzip_bytes)} gzip)`);
  return ['Frontend production budgets:', ...rows, 'Initial JavaScript composition:', ...chunks].join('\n');
}

async function main() {
  const frontendDir = path.join(REPOSITORY_ROOT, 'frontend');
  const budgets = await readJson(path.join(frontendDir, 'build-budgets.json'));
  const measurements = await measureFrontendBuild(path.join(frontendDir, 'dist'));
  console.log(formatReport(measurements, budgets));
  const errors = evaluateBudgets(measurements, budgets);
  if (errors.length > 0) throw new Error(`Frontend production budget exceeded:\n- ${errors.join('\n- ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
