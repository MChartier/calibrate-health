import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareSemver } from './release-config.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_LOCK_PATH = path.join(REPOSITORY_ROOT, 'package-lock.json');

export const UUID_ADVISORY_EXCEPTION = Object.freeze({
  advisory: 'GHSA-w5hq-g745-h8pq',
  expiresAt: '2026-08-12T00:00:00.000Z',
  tracker: 'https://github.com/MChartier/calibrate-health/issues/222'
});

/** Match every affected range published for GHSA-w5hq-g745-h8pq, including UUID 12 and 13. */
export function isUuidVersionAffected(uuidVersion) {
  return compareSemver(uuidVersion, '11.1.1') < 0 ||
    (compareSemver(uuidVersion, '12.0.0') >= 0 && compareSemver(uuidVersion, '12.0.1') < 0) ||
    (compareSemver(uuidVersion, '13.0.0') >= 0 && compareSemver(uuidVersion, '13.0.1') < 0);
}

/** Evaluate the approved advisory against its fixed version and hard release deadline. */
export function evaluateUuidAdvisoryException(uuidVersions, options = {}) {
  const versions = uuidVersions ?? [];
  const affectedVersions = versions.filter(isUuidVersionAffected);
  if (affectedVersions.length === 0) {
    return { ok: true, message: `${UUID_ADVISORY_EXCEPTION.advisory} is not present in the locked graph.` };
  }

  const versionLabel = affectedVersions.map((version) => `uuid@${version}`).join(', ');
  if (options.strict) {
    return {
      ok: false,
      message:
        `${UUID_ADVISORY_EXCEPTION.advisory} remains active through ${versionLabel}; ` +
        `production release validation requires resolution. See ${UUID_ADVISORY_EXCEPTION.tracker}.`
    };
  }

  const now = options.now ?? new Date();
  const expiresAt = new Date(UUID_ADVISORY_EXCEPTION.expiresAt);
  if (now.getTime() >= expiresAt.getTime()) {
    return {
      ok: false,
      message:
        `${UUID_ADVISORY_EXCEPTION.advisory} exception expired with ${versionLabel}. ` +
        `Upgrade or renew the evidence and deadline in ${UUID_ADVISORY_EXCEPTION.tracker}.`
    };
  }

  return {
    ok: true,
    message:
      `${UUID_ADVISORY_EXCEPTION.advisory} remains temporarily accepted for ${versionLabel}; ` +
      `it expires ${UUID_ADVISORY_EXCEPTION.expiresAt} and is tracked by ${UUID_ADVISORY_EXCEPTION.tracker}.`
  };
}

/** Collect root and nested UUID installs so a future npm layout cannot hide an affected copy. */
export function getLockedUuidVersions(lockfile) {
  const versions = Object.entries(lockfile.packages ?? {})
    .filter(([packagePath]) => /(^|\/)node_modules\/uuid$/.test(packagePath))
    .map(([, metadata]) => metadata?.version)
    .filter((version) => typeof version === 'string');
  return [...new Set(versions)].sort(compareSemver);
}

/** Read the root lockfile because production audit and release jobs install from this exact graph. */
export async function readLockedUuidVersions(lockfilePath = PACKAGE_LOCK_PATH) {
  return getLockedUuidVersions(JSON.parse(await readFile(lockfilePath, 'utf8')));
}

export async function checkDependencyAdvisoryExceptions(options = {}) {
  const uuidVersions = options.uuidVersions ?? await readLockedUuidVersions(options.lockfilePath);
  const result = evaluateUuidAdvisoryException(uuidVersions, options);
  if (!result.ok) throw new Error(result.message);
  return result.message;
}

async function main() {
  try {
    console.log(await checkDependencyAdvisoryExceptions({ strict: process.argv.includes('--strict') }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
