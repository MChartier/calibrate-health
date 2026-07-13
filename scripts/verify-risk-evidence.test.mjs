import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  loadRepositoryRiskEvidence,
  validateRiskEvidence
} from './verify-risk-evidence.mjs';

function repositoryFixture() {
  const loaded = loadRepositoryRiskEvidence();
  return {
    ...loaded,
    manifest: structuredClone(loaded.manifest),
    now: new Date('2026-07-13T12:00:00.000Z'),
    candidateCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  };
}

test('repository manifest covers every required capability and reports the physical release blocker', () => {
  const result = validateRiskEvidence(repositoryFixture());

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 6);
  assert.deepEqual(result.blockers.map((blocker) => blocker.id), [
    'physical-galaxy-phone-and-watch-validation'
  ]);
});

test('missing risk capability fails even when the rest of the area has evidence', () => {
  const fixture = repositoryFixture();
  const area = fixture.manifest.riskAreas.find(
    (candidate) => candidate.id === 'authentication-and-authorization'
  );
  for (const evidence of area.evidence) {
    evidence.capabilities = evidence.capabilities.filter((capability) => capability !== 'success');
  }

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.includes(
    'Risk area authentication-and-authorization has no evidence or waiver for success.'
  ));
});

test('unknown npm scripts and missing or escaping evidence paths fail validation', () => {
  const fixture = repositoryFixture();
  const evidence = fixture.manifest.riskAreas[0].evidence[0];
  evidence.npmScript = 'test:not-a-real-script';
  evidence.paths = ['quality/not-present.test.ts', '../outside.test.ts'];

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.some((error) => error.includes('unknown root npm script')));
  assert.ok(result.errors.some((error) => error.includes('does not exist')));
  assert.ok(result.errors.some((error) => error.includes('must stay within the repository')));
});

test('changed npm commands cannot retain stale evidence claims', () => {
  const fixture = repositoryFixture();
  fixture.packageScripts['test:backend'] = 'node -e "process.exit(0)"';

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.some((error) => error.includes('npm script command changed')));
});

test('workflow-backed evidence fails when its test command is removed', () => {
  const fixture = repositoryFixture();
  const evidence = fixture.manifest.riskAreas
    .find((area) => area.id === 'synchronization-and-offline-writes')
    .evidence.find((item) => item.id === 'watch-reconciliation');
  evidence.workflowContains = './gradlew command-that-does-not-exist';

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.some((error) => error.includes('workflow no longer contains')));
});

test('expired physical evidence waivers fail the contract instead of silently extending release risk', () => {
  const fixture = repositoryFixture();
  fixture.now = new Date('2026-08-13T00:00:00.000Z');

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.includes(
    'Waiver physical-galaxy-phone-and-watch-validation expired on 2026-08-12.'
  ));
  assert.equal(result.blockers.length, 1);
});

test('every waiver requires a scoped owner, reason, issue, and known capability', () => {
  const fixture = repositoryFixture();
  const area = fixture.manifest.riskAreas.find(
    (candidate) => candidate.id === 'authentication-and-authorization'
  );
  for (const evidence of area.evidence) {
    evidence.capabilities = evidence.capabilities.filter((capability) => capability !== 'success');
  }
  fixture.manifest.waivers.push({
    id: 'incomplete-waiver',
    riskArea: 'authentication-and-authorization',
    status: 'release-blocking',
    expiresOn: '2026-08-12',
    capabilities: ['success']
  });

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.includes('Waiver incomplete-waiver must name an owner.'));
  assert.ok(result.errors.includes('Waiver incomplete-waiver must explain why evidence is outstanding.'));
  assert.ok(result.errors.some((error) => error.includes('trackingIssues must contain')));
});

test('physical evidence replaces the temporary waiver instead of requiring it forever', () => {
  const fixture = repositoryFixture();
  fixture.releaseMode = true;
  const physicalWaiver = fixture.manifest.waivers.find(
    (waiver) => waiver.id === 'physical-galaxy-phone-and-watch-validation'
  );
  const physicalRecord = {
    id: 'recorded-physical-validation',
    riskArea: 'critical-client-workflows',
    status: 'passed',
    owner: 'MChartier',
    executedOn: '2026-07-13',
    releaseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    command: 'Follow the paired Galaxy release matrix in docs/play-console-health-release-checklist.md',
    deviceModels: {
      phone: 'Samsung Galaxy phone fixture',
      watch: 'Samsung Galaxy Watch Ultra fixture'
    },
    protocolPath: 'docs/play-console-health-release-checklist.md',
    resultArtifact: 'quality/physical-results/test-fixture.json',
    capabilities: [...physicalWaiver.capabilities]
  };
  fixture.manifest.physicalDeviceEvidence.push(physicalRecord);
  fixture.manifest.waivers = fixture.manifest.waivers.filter(
    (waiver) => waiver.id !== physicalWaiver.id
  );
  const artifact = { schemaVersion: 1, ...physicalRecord };
  delete artifact.id;
  delete artifact.riskArea;
  delete artifact.protocolPath;
  delete artifact.resultArtifact;
  fixture.statSync = (resolvedPath) => resolvedPath.endsWith('test-fixture.json')
    ? { isFile: () => true, size: 100 }
    : fs.statSync(resolvedPath);
  fixture.readFileSync = (resolvedPath, encoding) => resolvedPath.endsWith('test-fixture.json')
    ? JSON.stringify(artifact)
    : fs.readFileSync(resolvedPath, encoding);

  const result = validateRiskEvidence(fixture);

  assert.deepEqual(result.errors, []);
  assert.equal(result.blockers.some((blocker) => blocker.id === physicalWaiver.id), false);
});

test('release mode rejects physical evidence recorded for a different candidate commit', () => {
  const fixture = repositoryFixture();
  fixture.releaseMode = true;
  fixture.candidateCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const physicalWaiver = fixture.manifest.waivers.find(
    (waiver) => waiver.id === 'physical-galaxy-phone-and-watch-validation'
  );
  const physicalRecord = {
    id: 'stale-physical-validation',
    riskArea: 'critical-client-workflows',
    status: 'passed',
    owner: 'MChartier',
    executedOn: '2026-07-13',
    releaseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    command: 'Follow the paired Galaxy release matrix in docs/play-console-health-release-checklist.md',
    deviceModels: { phone: 'Galaxy phone', watch: 'Galaxy Watch Ultra' },
    protocolPath: 'docs/play-console-health-release-checklist.md',
    resultArtifact: 'quality/physical-results/test-fixture.json',
    capabilities: [...physicalWaiver.capabilities]
  };
  fixture.manifest.physicalDeviceEvidence.push(physicalRecord);
  fixture.manifest.waivers = [];
  const artifact = { schemaVersion: 1, ...physicalRecord };
  delete artifact.id;
  delete artifact.riskArea;
  delete artifact.protocolPath;
  delete artifact.resultArtifact;
  fixture.statSync = (resolvedPath) => resolvedPath.endsWith('test-fixture.json')
    ? { isFile: () => true, size: 100 }
    : fs.statSync(resolvedPath);
  fixture.readFileSync = (resolvedPath, encoding) => resolvedPath.endsWith('test-fixture.json')
    ? JSON.stringify(artifact)
    : fs.readFileSync(resolvedPath, encoding);

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.some((error) => error.includes('does not match release candidate')));
});

test('ordinary unit evidence cannot clear a physical-device capability', () => {
  const fixture = repositoryFixture();
  const evidence = fixture.manifest.riskAreas
    .find((area) => area.id === 'critical-client-workflows')
    .evidence[0];
  evidence.capabilities.push('wear-physical-happy-path');

  const result = validateRiskEvidence(fixture);

  assert.ok(result.errors.some((error) => error.includes('use physicalDeviceEvidence')));
});
