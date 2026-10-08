import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHA, DIGEST } from './release-plan.mjs';
import { iosBuildRequest } from './ios-release.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const RUNNING = new Set(['NEW', 'IN_QUEUE', 'IN_PROGRESS', 'PENDING_CANCEL']);

/** Download one bounded canonical receipt; artifact transport alone never admits it as a successful baseline. */
export function downloadWorkflowReceipt({ root, repository, runId, name, fileName, encode, execute = execFileSync, ghPath = 'gh' }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^[1-9]\d*$/.test(String(runId)) &&
    /^[a-z0-9-]+$/.test(name) && /^[a-z0-9-]+\.json$/.test(fileName), 'Invalid worker receipt location.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-worker-receipt-'));
  try {
    try {
      execute(ghPath, ['run', 'download', String(runId), '--repo', repository, '--name', name, '--dir', directory],
        { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { throw Error('The selected worker receipt is unavailable; reconcile its retained run without starting another build.'); }
    assert.deepEqual(fs.readdirSync(directory), [fileName], 'Unexpected worker receipt artifact contents.');
    const file = path.join(directory, fileName);
    assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).size < 64 * 1024,
      'Worker receipt must be a bounded regular file.');
    const content = fs.readFileSync(file), receipt = JSON.parse(content);
    assert(content.equals(Buffer.from(encode(receipt))), 'Worker receipt artifact bytes are not canonical.');
    return receipt;
  } finally {
    assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('calibrate-worker-receipt-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** EAS 22.4.0 JSON commands. execute must capture output privately and throw on transport/CLI failure. */
export function easIosBuildProvider({ execute, verifyArtifact, assertSource }) {
  function request(identity) {
    assert(SHA.test(identity.source) && DIGEST.test(identity.planDigest), 'Missing iOS provider identity.');
    return iosBuildRequest(identity);
  }
  function bind(build, identity) {
    const expected = request(identity);
    assert(UUID.test(build?.id) && build.platform === 'IOS' && build.app?.id === identity.configuration.projectId && build.isForIosSimulator === false &&
      build.gitCommitHash === identity.source && build.buildProfile === identity.profile &&
      build.appVersion === identity.version.version && build.appBuildVersion === identity.version.buildNumber &&
      build.runtime?.version === expected.binding.runtime && build.updateChannel?.name === identity.configuration.channel &&
      build.message === `calibrate:${identity.source}:${identity.planDigest}`, 'EAS build identity differs from the immutable request.');
    assert(build.distribution === (identity.profile === 'production' ? 'STORE' : 'INTERNAL'), 'Unexpected EAS distribution.');
    return build;
  }
  async function view(id, identity) {
    assert(UUID.test(id), 'Invalid EAS build ID.');
    const build = bind(await execute(['build:view', id, '--json']), identity);
    assert.equal(build.id, id, 'EAS returned a different build ID.');
    return build;
  }
  async function assertAllocation(identity) {
    const expected = request(identity);
    for (let offset = 0; offset < 50000; offset += 50) {
      const page = await execute(['build:list', '--platform', 'ios', '--offset', String(offset), '--limit', '50', '--json', '--non-interactive']);
      assert(Array.isArray(page) && page.length <= 50, 'Incomplete EAS allocation inventory.');
      for (const build of page) {
        assert(build.platform === 'IOS' && build.app?.id === identity.configuration.projectId && typeof build.isForIosSimulator === 'boolean',
          'EAS allocation inventory contains an unrelated or unknown build.');
        if (build.isForIosSimulator) continue;
        assert(/^[1-9]\d{0,8}$/.test(build.appBuildVersion ?? ''), 'An existing iOS build has an unknown allocation; reconcile before spending.');
        if (Number(build.appBuildVersion) < Number(expected.binding.buildNumber)) continue;
        // A failed build of this exact request cannot have uploaded itself: this
        // worker freezes signing and never enables automatic submission.
        const sameFailedRequest = build.appBuildVersion === expected.binding.buildNumber &&
          ['ERRORED', 'CANCELED'].includes(build.status) && build.message === `calibrate:${identity.source}:${identity.planDigest}`;
        assert(sameFailedRequest, 'iOS build allocation collides with an existing provider build; reconcile without starting another paid build.');
        bind(build, identity);
      }
      if (page.length < 50) return;
    }
    throw Error('EAS allocation inventory exceeded the complete-read bound.');
  }
  return {
    find: async identity => {
      request(identity);
      const results = [];
      for (let offset = 0; offset < 50000; offset += 50) {
        const page = await execute(['build:list', '--platform', 'ios', '--git-commit-hash', identity.source,
          '--build-profile', identity.profile, '--offset', String(offset), '--limit', '50', '--json', '--non-interactive']);
        assert(Array.isArray(page) && page.length <= 50, 'Incomplete EAS build inventory.');
        for (const build of page) {
          if (build.message !== `calibrate:${identity.source}:${identity.planDigest}`) continue;
          results.push(bind(build, identity).id);
        }
        if (page.length < 50) return results;
      }
      throw Error('EAS build inventory exceeded the complete-read bound.');
    },
    start: async identity => {
      await assertSource(identity);
      await assertAllocation(identity);
      await assertSource(identity);
      const buildRequest = request(identity);
      const response = await execute(buildRequest.args, buildRequest.environment);
      assert(Array.isArray(response) && response.length === 1, 'EAS did not return exactly one iOS build.');
      return bind(response[0], identity).id;
    },
    status: async (id, identity) => {
      const build = await view(id, identity);
      if (build.status === 'FINISHED') return 'complete';
      if (['ERRORED', 'CANCELED'].includes(build.status)) return 'failed';
      assert(RUNNING.has(build.status), 'Unknown EAS build status; retain the request for reconciliation.');
      return 'running';
    },
    verify: async (id, identity) => {
      const build = await view(id, identity);
      assert(build.status === 'FINISHED', 'Only a finished EAS build can supply an artifact receipt.');
      assert(typeof build.artifacts?.buildUrl === 'string' && new URL(build.artifacts.buildUrl).protocol === 'https:', 'Missing HTTPS IPA artifact.');
      // The verifier downloads these exact bytes and checks the IPA, never merely EAS labels.
      const receipt = await verifyArtifact(build, { ...request(identity).binding, configuration: identity.configuration });
      assert(receipt.buildId === id && receipt.source === identity.source && DIGEST.test(receipt.artifactSha256), 'IPA verification returned an unrelated receipt.');
      return receipt;
    }
  };
}

/** Dispatch fixed maintained GitHub workers; never interpret a missing dispatch response as absence. */
export function githubWorkflowProvider({ repository, workflow, api, verifyResult, assertSource }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^[a-z][a-z0-9-]*\.yml$/.test(workflow), 'Invalid worker authority.');
  const root = `/repos/${repository}`;
  function bind(run, identity) {
    assert(SHA.test(identity.source) && run.path === `.github/workflows/${workflow}` && run.event === 'workflow_dispatch' &&
      run.head_sha === identity.source && run.head_branch === 'master' && run.repository?.full_name === repository &&
      run.display_title === identity.title && Number.isSafeInteger(run.id) && run.id > 0, 'Worker run identity differs.');
    return run;
  }
  async function view(id, identity) {
    assert(/^[1-9]\d*$/.test(id), 'Invalid worker run ID.');
    const run = bind(await api(`${root}/actions/runs/${id}`), identity);
    assert.equal(String(run.id), id, 'Worker returned a different run ID.');
    return run;
  }
  async function find(identity) {
    const runs = await api(`${root}/actions/workflows/${workflow}/runs?event=workflow_dispatch&head_sha=${identity.source}&per_page=100`, 'workflow_runs');
    assert(Array.isArray(runs), 'Incomplete worker run inventory.');
    return runs.filter(run => run.display_title === identity.title).map(run => String(bind(run, identity).id));
  }
  return {
    find,
    start: async identity => {
      await assertSource(identity);
      await api(`${root}/actions/workflows/${workflow}/dispatches`, null,
        { method: 'POST', body: { ref: 'master', inputs: identity.inputs } });
      const found = await find(identity);
      assert(found.length === 1, 'Dispatch outcome is not yet a singleton; resume after provider reconciliation.');
      return found[0];
    },
    status: async (id, identity) => {
      const run = await view(id, identity);
      if (run.status !== 'completed') return 'running';
      if (run.conclusion === 'success') return 'complete';
      // A failed workflow may have published partially. It is never safe to blindly dispatch a replacement.
      throw Error('Worker stopped without verified success; reconcile its retained run and artifacts before retrying.');
    },
    verify: async (id, identity) => {
      const run = await view(id, identity);
      assert(run.status === 'completed' && run.conclusion === 'success', 'Worker has not completed successfully.');
      return verifyResult(run, identity);
    }
  };
}
