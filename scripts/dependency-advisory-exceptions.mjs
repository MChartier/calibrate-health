import { spawnSync } from 'node:child_process';
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
  packageName: 'image-size',
  packagePath: 'node_modules/image-size',
  lockedVersion: '1.2.1',
  reviewedOn: '2026-08-15',
  expiresAt: '2026-08-23T00:00:00.000Z',
  advisories: Object.freeze([
    Object.freeze({
      id: 'GHSA-w3rx-r6r6-pgpr',
      url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr'
    }),
    Object.freeze({
      id: 'GHSA-5p2g-fcmc-qvqq',
      url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq'
    })
  ]),
  auditNodes: Object.freeze({
    '@expo/cli': Object.freeze(['node_modules/expo/node_modules/@expo/cli']),
    '@expo/metro': Object.freeze(['node_modules/@expo/metro']),
    '@expo/metro-config': Object.freeze(['node_modules/@expo/metro-config']),
    '@react-native/community-cli-plugin': Object.freeze(['node_modules/@react-native/community-cli-plugin']),
    '@react-native/metro-config': Object.freeze(['node_modules/@react-native/metro-config']),
    '@react-native/virtualized-lists': Object.freeze(['node_modules/@react-native/virtualized-lists']),
    expo: Object.freeze(['node_modules/expo']),
    'image-size': Object.freeze(['node_modules/image-size']),
    metro: Object.freeze(['node_modules/metro']),
    'metro-config': Object.freeze(['node_modules/metro-config']),
    'metro-transform-worker': Object.freeze(['node_modules/metro-transform-worker']),
    'react-native': Object.freeze(['node_modules/react-native']),
    'react-native-reanimated': Object.freeze(['mobile/node_modules/react-native-reanimated']),
    'react-native-screens': Object.freeze(['node_modules/react-native-screens']),
    'react-native-worklets': Object.freeze(['node_modules/react-native-worklets'])
  }),
  rationale:
    'Metro uses image-size only while bundling repository-owned assets; deployed web, Android, Wear, and backend artifacts do not execute these parsers. No patched npm release existed at review time.'
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

/** Track the currently published vulnerable image-size range until upstream ships a fix. */
export function isImageSizeVersionAffected(imageSizeVersion) {
  return compareSemver(imageSizeVersion, '2.0.2') <= 0;
}

/** Collect every image-size install so only the reviewed Metro edge can use the exception. */
export function getLockedImageSizeInstalls(lockfile) {
  return Object.entries(lockfile.packages ?? {})
    .filter(([packagePath]) => /(^|\/)node_modules\/image-size$/.test(packagePath))
    .map(([packagePath, metadata]) => ({ path: packagePath, version: metadata?.version }))
    .filter((install) => typeof install.version === 'string')
    .sort((left, right) => left.path.localeCompare(right.path));
}

/** Reject unreviewed versions, paths, expiry, and strict production release use. */
export function evaluateImageSizeAdvisoryException(imageSizeInstalls, options = {}) {
  const installs = imageSizeInstalls ?? [];
  const advisoryLabel = IMAGE_SIZE_ADVISORY_EXCEPTION.advisories
    .map((advisory) => advisory.id)
    .join(' and ');
  if (installs.length === 0) {
    return { ok: true, message: `${advisoryLabel} are not present in the locked graph.` };
  }

  const approvedInstall = installs.length === 1 &&
    installs[0].path === IMAGE_SIZE_ADVISORY_EXCEPTION.packagePath &&
    installs[0].version === IMAGE_SIZE_ADVISORY_EXCEPTION.lockedVersion;
  if (!approvedInstall) {
    const found = installs
      .map((install) => `${install.path}@${install.version}`)
      .join(', ');
    return {
      ok: false,
      message:
        `${advisoryLabel} exception is limited to ` +
        `${IMAGE_SIZE_ADVISORY_EXCEPTION.packagePath}@${IMAGE_SIZE_ADVISORY_EXCEPTION.lockedVersion}; found ${found}.`
    };
  }

  if (options.strict) {
    return {
      ok: false,
      message:
        `${advisoryLabel} remain active through image-size@${IMAGE_SIZE_ADVISORY_EXCEPTION.lockedVersion}; ` +
        'production release validation requires an upstream fix.'
    };
  }

  const now = options.now ?? new Date();
  const expiresAt = new Date(IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt);
  if (now.getTime() >= expiresAt.getTime()) {
    return {
      ok: false,
      message:
        `${advisoryLabel} exception expired for image-size@${IMAGE_SIZE_ADVISORY_EXCEPTION.lockedVersion}. ` +
        `Review the upstream advisories and either upgrade or renew the evidence.`
    };
  }

  const upstreamUrls = IMAGE_SIZE_ADVISORY_EXCEPTION.advisories
    .map((advisory) => advisory.url)
    .join(', ');
  return {
    ok: true,
    message:
      `${advisoryLabel} remain temporarily accepted for ` +
      `${IMAGE_SIZE_ADVISORY_EXCEPTION.packagePath}@${IMAGE_SIZE_ADVISORY_EXCEPTION.lockedVersion}; ` +
      `reviewed ${IMAGE_SIZE_ADVISORY_EXCEPTION.reviewedOn}, expires ${IMAGE_SIZE_ADVISORY_EXCEPTION.expiresAt}. ` +
      `${IMAGE_SIZE_ADVISORY_EXCEPTION.rationale} Upstream: ${upstreamUrls}`
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

const AUDIT_FAILURE_SEVERITIES = new Set(['high', 'critical']);

function extractAdvisoryId(via) {
  if (!via || typeof via !== 'object') return null;
  const match = typeof via.url === 'string' ? via.url.match(/GHSA-[a-z0-9-]+/i) : null;
  return match?.[0] ?? null;
}

function collectAuditAdvisories(packageName, vulnerabilities, visited = new Set()) {
  if (visited.has(packageName)) return [];
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via)) {
    return [{ id: null, dependency: packageName, sourcePackage: packageName }];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(packageName);
  const findings = [];
  for (const via of vulnerability.via) {
    if (typeof via === 'string') {
      findings.push(...collectAuditAdvisories(via, vulnerabilities, nextVisited));
      continue;
    }
    findings.push({
      id: extractAdvisoryId(via),
      dependency: via?.dependency ?? via?.name ?? null,
      sourcePackage: packageName
    });
  }
  return findings;
}

/** Accept only the two reviewed leaf advisories and their npm-reported transitive effects. */
export function evaluateProductionAuditReport(auditReport, lockfile, options = {}) {
  if (
    auditReport?.auditReportVersion !== 2 ||
    !auditReport.vulnerabilities ||
    typeof auditReport.vulnerabilities !== 'object'
  ) {
    return { ok: false, message: 'npm audit did not return a recognized version 2 report.' };
  }

  const vulnerabilities = auditReport.vulnerabilities;
  const installs = getLockedImageSizeInstalls(lockfile);
  const exception = evaluateImageSizeAdvisoryException(installs, options);
  if (!exception.ok) return exception;

  const highOrCritical = Object.entries(vulnerabilities)
    .filter(([, vulnerability]) => AUDIT_FAILURE_SEVERITIES.has(vulnerability?.severity));
  if (highOrCritical.length === 0) {
    return {
      ok: true,
      message: `npm audit reports no high or critical production findings. ${exception.message}`
    };
  }

  const reviewedIds = new Set(
    IMAGE_SIZE_ADVISORY_EXCEPTION.advisories.map((advisory) => advisory.id)
  );
  const imageSizeFinding = vulnerabilities[IMAGE_SIZE_ADVISORY_EXCEPTION.packageName];
  const exactNode = Array.isArray(imageSizeFinding?.nodes) &&
    imageSizeFinding.nodes.length === 1 &&
    imageSizeFinding.nodes[0] === IMAGE_SIZE_ADVISORY_EXCEPTION.packagePath;
  const directImageSizeAdvisories = Array.isArray(imageSizeFinding?.via)
    ? imageSizeFinding.via.filter((via) => via && typeof via === 'object')
    : [];
  const directIds = new Set(directImageSizeAdvisories.map(extractAdvisoryId));
  const exactAdvisories = AUDIT_FAILURE_SEVERITIES.has(imageSizeFinding?.severity) &&
    Array.isArray(imageSizeFinding?.via) &&
    directImageSizeAdvisories.length === imageSizeFinding.via.length &&
    directIds.size === reviewedIds.size &&
    [...reviewedIds].every((advisoryId) => directIds.has(advisoryId)) &&
    directImageSizeAdvisories.every((via) =>
      (via.dependency ?? via.name) === IMAGE_SIZE_ADVISORY_EXCEPTION.packageName
    );
  if (!exactNode || !exactAdvisories) {
    return {
      ok: false,
      message: 'npm audit image-size finding no longer matches the reviewed advisory IDs and install path.'
    };
  }

  const unexpectedPackages = [];
  for (const [packageName, vulnerability] of highOrCritical) {
    const advisories = collectAuditAdvisories(packageName, vulnerabilities);
    const reviewedNodes = IMAGE_SIZE_ADVISORY_EXCEPTION.auditNodes[packageName];
    const exactReviewedNodes = Array.isArray(reviewedNodes) &&
      Array.isArray(vulnerability.nodes) &&
      vulnerability.nodes.length === reviewedNodes.length &&
      reviewedNodes.every((node) => vulnerability.nodes.includes(node));
    const onlyReviewedImageSizeAdvisories = exactReviewedNodes &&
      advisories.length > 0 &&
      advisories.every((advisory) =>
        reviewedIds.has(advisory.id) &&
        advisory.dependency === IMAGE_SIZE_ADVISORY_EXCEPTION.packageName &&
        advisory.sourcePackage === IMAGE_SIZE_ADVISORY_EXCEPTION.packageName
      );
    if (!onlyReviewedImageSizeAdvisories) unexpectedPackages.push(packageName);
  }
  if (unexpectedPackages.length > 0) {
    return {
      ok: false,
      message:
        `npm audit reports unreviewed high or critical production findings through: ` +
        `${unexpectedPackages.join(', ')}.`
    };
  }

  return {
    ok: true,
    message:
      `npm audit high/critical findings are limited to the reviewed image-size exception. ${exception.message}`
  };
}

async function readProductionLockfile(lockfilePath = PACKAGE_LOCK_PATH) {
  return JSON.parse(await readFile(lockfilePath, 'utf8'));
}

export async function checkDependencyAdvisoryExceptions(options = {}) {
  const lockfile = options.lockfile ?? await readProductionLockfile(options.lockfilePath);
  const uuidVersions = options.uuidVersions ?? getLockedUuidVersions(lockfile);
  const imageSizeInstalls = options.imageSizeInstalls ?? getLockedImageSizeInstalls(lockfile);
  const results = [
    evaluateUuidAdvisoryException(uuidVersions, options),
    evaluateImageSizeAdvisoryException(imageSizeInstalls, options)
  ];
  const failed = results.find((result) => !result.ok);
  if (failed) throw new Error(failed.message);
  return results.map((result) => result.message).join('\n');
}

export async function runProductionDependencyAudit(options = {}) {
  const lockfile = options.lockfile ?? await readProductionLockfile(options.lockfilePath);
  let auditReport = options.auditReport;
  if (!auditReport) {
    const auditArguments = ['audit', '--omit=dev', '--audit-level=high', '--json'];
    const npmExecPath = process.env.npm_execpath;
    const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const commandArguments = npmExecPath ? [npmExecPath, ...auditArguments] : auditArguments;
    const result = spawnSync(command, commandArguments, {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`npm audit failed before producing a report (exit ${result.status ?? 'unknown'}).`);
    }
    try {
      auditReport = JSON.parse(result.stdout);
    } catch {
      throw new Error('npm audit did not produce valid JSON.');
    }
  }

  const result = evaluateProductionAuditReport(auditReport, lockfile, options);
  if (!result.ok) throw new Error(result.message);
  return result.message;
}

async function main() {
  try {
    const strict = process.argv.includes('--strict');
    const message = process.argv.includes('--audit-production')
      ? await runProductionDependencyAudit({ strict })
      : await checkDependencyAdvisoryExceptions({ strict });
    console.log(message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
