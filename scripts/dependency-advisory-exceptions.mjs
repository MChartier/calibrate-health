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

export const IMAGE_SIZE_ADVISORY_EXCEPTION = Object.freeze({
  advisories: Object.freeze([
    'GHSA-w3rx-r6r6-pgpr',
    'GHSA-5p2g-fcmc-qvqq'
  ]),
  allowedVersion: '1.2.1',
  expiresAt: '2026-08-21T00:00:00.000Z',
  references: Object.freeze([
    'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
    'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq'
  ])
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

/** Keep the no-fix image-size exception bound to Metro's currently reviewed lockfile edge. */
export function evaluateImageSizeAdvisoryException(imageSizeVersions, options = {}) {
  const versions = [...new Set(imageSizeVersions ?? [])].sort(compareSemver);
  const advisoryLabel = IMAGE_SIZE_ADVISORY_EXCEPTION.advisories.join(', ');
  if (versions.length === 0) {
    return { ok: true, message: `${advisoryLabel} are not present in the locked graph.` };
  }

  if (versions.length !== 1 || versions[0] !== IMAGE_SIZE_ADVISORY_EXCEPTION.allowedVersion) {
    return {
      ok: false,
      message:
        `${advisoryLabel} exception only covers image-size@${IMAGE_SIZE_ADVISORY_EXCEPTION.allowedVersion}; ` +
        `the locked graph now contains ${versions.map((version) => `image-size@${version}`).join(', ')}. ` +
        `Re-evaluate the dependency and advisory status before changing the exception.`
    };
  }

  const versionLabel = `image-size@${versions[0]}`;
  if (options.strict) {
    return {
      ok: false,
      message:
        `${advisoryLabel} remain active through ${versionLabel}; production release validation ` +
        `requires resolution. See ${IMAGE_SIZE_ADVISORY_EXCEPTION.references.join(' and ')}.`
    };
  }

  const now = options.now ?? new Date();
  const expiresAt = new Date(IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt);
  if (now.getTime() >= expiresAt.getTime()) {
    return {
      ok: false,
      message:
        `${advisoryLabel} exception expired with ${versionLabel}. Upgrade Metro's dependency or ` +
        `renew the evidence and deadline using ${IMAGE_SIZE_ADVISORY_EXCEPTION.references.join(' and ')}.`
    };
  }

  return {
    ok: true,
    message:
      `${advisoryLabel} remain temporarily accepted for ${versionLabel}; the exception expires ` +
      `${IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt}. See ${IMAGE_SIZE_ADVISORY_EXCEPTION.references.join(' and ')}.`
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

/** Collect every image-size install so a changed Metro graph invalidates the reviewed exception. */
export function getLockedImageSizeVersions(lockfile) {
  const versions = Object.entries(lockfile.packages ?? {})
    .filter(([packagePath]) => /(^|\/)node_modules\/image-size$/.test(packagePath))
    .map(([, metadata]) => metadata?.version)
    .filter((version) => typeof version === 'string');
  return [...new Set(versions)].sort(compareSemver);
}

/** Read the root lockfile because production audit and release jobs install from this exact graph. */
export async function readLockedUuidVersions(lockfilePath = PACKAGE_LOCK_PATH) {
  return getLockedUuidVersions(JSON.parse(await readFile(lockfilePath, 'utf8')));
}

export async function readLockedImageSizeVersions(lockfilePath = PACKAGE_LOCK_PATH) {
  return getLockedImageSizeVersions(JSON.parse(await readFile(lockfilePath, 'utf8')));
}

export async function checkDependencyAdvisoryExceptions(options = {}) {
  const lockfile = options.lockfilePath
    ? JSON.parse(await readFile(options.lockfilePath, 'utf8'))
    : JSON.parse(await readFile(PACKAGE_LOCK_PATH, 'utf8'));
  const uuidVersions = options.uuidVersions ?? getLockedUuidVersions(lockfile);
  const imageSizeVersions = options.imageSizeVersions ?? getLockedImageSizeVersions(lockfile);
  const results = [
    evaluateUuidAdvisoryException(uuidVersions, options),
    evaluateImageSizeAdvisoryException(imageSizeVersions, options)
  ];
  const failure = results.find((result) => !result.ok);
  if (failure) throw new Error(failure.message);
  return results.map((result) => result.message).join('\n');
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
