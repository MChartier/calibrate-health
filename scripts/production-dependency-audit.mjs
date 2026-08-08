import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  IMAGE_SIZE_ADVISORY_EXCEPTION,
  evaluateImageSizeAdvisoryException,
  getLockedImageSizeVersions
} from './dependency-advisory-exceptions.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_LOCK_PATH = path.join(REPOSITORY_ROOT, 'package-lock.json');
const AUDITED_SEVERITIES = new Set(['high', 'critical']);

function extractAdvisoryId(via) {
  if (!via || typeof via !== 'object') return undefined;
  return via.url?.match(/GHSA-[a-z0-9-]+/i)?.[0];
}

/** Resolve npm's cyclic vulnerability graph to the leaf advisories behind each package entry. */
export function collectAuditAdvisories(vulnerabilities) {
  const entries = vulnerabilities ?? {};
  const advisoriesByPackage = new Map(
    Object.entries(entries).map(([packageName, vulnerability]) => [
      packageName,
      new Set((vulnerability.via ?? []).map(extractAdvisoryId).filter(Boolean))
    ])
  );
  const unresolvedByPackage = new Map(
    Object.entries(entries).map(([packageName, vulnerability]) => [
      packageName,
      new Set(
        (vulnerability.via ?? [])
          .filter((via) => typeof via === 'string' && !(via in entries))
          .map(String)
      )
    ])
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [packageName, vulnerability] of Object.entries(entries)) {
      const packageAdvisories = advisoriesByPackage.get(packageName);
      const unresolved = unresolvedByPackage.get(packageName);
      for (const via of vulnerability.via ?? []) {
        if (typeof via !== 'string' || !(via in entries)) continue;
        for (const advisory of advisoriesByPackage.get(via)) {
          if (!packageAdvisories.has(advisory)) {
            packageAdvisories.add(advisory);
            changed = true;
          }
        }
        for (const dependency of unresolvedByPackage.get(via)) {
          if (!unresolved.has(dependency)) {
            unresolved.add(dependency);
            changed = true;
          }
        }
      }
    }
  }

  return Object.fromEntries(
    Object.keys(entries).map((packageName) => [packageName, {
      advisories: [...advisoriesByPackage.get(packageName)].sort(),
      unresolved: [...unresolvedByPackage.get(packageName)].sort()
    }])
  );
}

/** Exempt only high/critical entries whose complete npm dependency chain ends at the reviewed advisories. */
export function evaluateProductionAuditReport(report, imageSizeVersions, options = {}) {
  const exception = evaluateImageSizeAdvisoryException(imageSizeVersions, options);
  const vulnerabilities = report?.vulnerabilities ?? {};
  const resolved = collectAuditAdvisories(vulnerabilities);
  const allowedAdvisories = new Set(IMAGE_SIZE_ADVISORY_EXCEPTION.advisories);
  const exempted = [];
  const remaining = [];

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!AUDITED_SEVERITIES.has(vulnerability.severity)) continue;
    const roots = resolved[packageName];
    const isFullyExplainedByException =
      exception.ok &&
      roots.advisories.length > 0 &&
      roots.unresolved.length === 0 &&
      roots.advisories.every((advisory) => allowedAdvisories.has(advisory));
    (isFullyExplainedByException ? exempted : remaining).push({
      package: packageName,
      advisories: roots.advisories,
      unresolved: roots.unresolved
    });
  }

  return {
    ok: exception.ok && remaining.length === 0,
    exception,
    exempted,
    remaining
  };
}

function runNpmAudit() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'audit', '--omit=dev', '--audit-level=high', '--json']
    : ['audit', '--omit=dev', '--audit-level=high', '--json'];
  return spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true
  });
}

function describeFinding(finding) {
  const roots = finding.advisories.length > 0
    ? finding.advisories.join(', ')
    : `unresolved dependencies: ${finding.unresolved.join(', ') || 'none reported'}`;
  return `${finding.package} (${roots})`;
}

async function main() {
  const audit = runNpmAudit();
  if (audit.error) throw audit.error;

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error(`npm audit did not return JSON. ${audit.stderr.trim()}`.trim());
  }
  if (!report.vulnerabilities) {
    throw new Error(`npm audit did not return a vulnerability report. ${report.message ?? audit.stderr}`.trim());
  }

  const lockfile = JSON.parse(await readFile(PACKAGE_LOCK_PATH, 'utf8'));
  const result = evaluateProductionAuditReport(report, getLockedImageSizeVersions(lockfile));
  console.log(result.exception.message);
  if (!result.ok) {
    if (!result.exception.ok) console.error(result.exception.message);
    if (result.remaining.length > 0) {
      console.error(`Unexcepted high/critical production findings: ${result.remaining.map(describeFinding).join('; ')}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production audit has no unexcepted high/critical findings; ` +
    `${result.exempted.length} package entries resolve only to the temporary image-size advisories.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
