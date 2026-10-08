import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, SHA, verifyPlan } from './release-plan.mjs';
import { readAsset } from './release-journal.mjs';
import { manualReleaseContext } from './release-controller.mjs';
import { verifyExecutionSource } from './release-source.mjs';
import { ReleaseJournal, githubJournalTransport } from './release-journal.mjs';
import { releaseGithubApi } from './release-github.mjs';
import { verifyReleaseRequestArtifact } from './release-request.mjs';
import { githubWorkflowProvider } from './release-providers.mjs';

/** A fresh read-only request lets the unchanged server worker retain its current-master guard. */
export function serverHandoffIdentity({ plan, source }) {
  verifyPlan(plan);
  assert(SHA.test(source) && ['patch', 'minor', 'major'].includes(plan.serverBump) &&
    plan.stages.at(-1)?.key === 'server' && plan.stages.filter(stage => stage.kind === 'server').length === 1,
  'The immutable plan did not select one final server stage.');
  return { source, planDigest: plan.digest, configurationDigest: plan.serverConfiguration,
    title: `Unified server ${plan.runId} ${plan.digest}`,
    inputs: { parent_run_id: plan.runId, plan_digest: plan.digest, source_commit: source, bump: plan.serverBump } };
}

/** A successful read-only request is not a successful release: follow its protected handler and verify the image. */
export function serverHandoffProvider({ repository, api, assertSource, verifyResult }) {
  const requestProvider = githubWorkflowProvider({ repository, api, assertSource,
    workflow: 'unified-server-request.yml', verifyResult: async run => run });
  async function handlerFor(id, identity) {
    await requestProvider.verify(id, identity);
    const runs = await api(`/repos/${repository}/actions/workflows/unified-server-handler.yml/runs?event=workflow_run&head_sha=${identity.source}`, 'workflow_runs');
    const selected = runs.filter(run => run.display_title === `Unified server request ${id}`);
    assert(selected.length <= 1, 'Multiple server handlers require reconciliation; no new dispatch is permitted.');
    const handler = selected[0];
    if (handler) assert(handler.path === '.github/workflows/unified-server-handler.yml' && handler.event === 'workflow_run' &&
      handler.head_sha === identity.source && handler.head_branch === 'master' && handler.repository?.full_name === repository &&
      handler.head_repository?.full_name === repository && Number.isSafeInteger(handler.id) && handler.id > 0,
    'Server handler source or repository differs.');
    return handler;
  }
  return { identity: serverHandoffIdentity, find: requestProvider.find, start: requestProvider.start,
    status: async (id, identity) => {
      if (await requestProvider.status(id, identity) !== 'complete') return 'running';
      const handler = await handlerFor(id, identity);
      if (!handler || handler.status !== 'completed') return 'running';
      // A failure can follow successful publication. The original image authority,
      // not a workflow conclusion, decides whether the artifact actually exists.
      await verifyResult(handler, identity);
      return 'complete';
    },
    verify: async (id, identity) => {
      const handler = await handlerFor(id, identity);
      assert(handler?.status === 'completed', 'Protected server worker is still running or absent.');
      return verifyResult(handler, identity);
    }
  };
}

/** Read-only admission before the fresh handler receives any server publication authority. */
export async function verifyServerHandoff({ root, repository, repositoryId, workflowSha, event,
  request, handler, inputs, journal, api, currentMaster, verifySource = verifyExecutionSource }) {
  const sameRepository = run => run.repository?.full_name === repository && run.head_repository?.full_name === repository &&
    String(run.repository.id) === String(repositoryId) && run.head_branch === 'master';
  assert(SHA.test(workflowSha) && workflowSha === currentMaster && inputs.source_sha === workflowSha &&
    inputs.operation === 'cut-release' && inputs.selective === true && inputs.parent_run_id === journal.runId,
  'Server handoff requires the exact current protected source and selected parent.');
  assert(sameRepository(request) && request.path === '.github/workflows/unified-server-request.yml' &&
    request.event === 'workflow_dispatch' && request.head_sha === workflowSha && request.status === 'completed' && request.conclusion === 'success' &&
    request.actor?.login === 'github-actions[bot]' && request.triggering_actor?.login === 'github-actions[bot]',
  'Only the retained Actions request can hand off the selected server stage.');
  assert(sameRepository(handler) && handler.path === '.github/workflows/unified-server-handler.yml' &&
    handler.event === 'workflow_run' && handler.head_sha === workflowSha && event.action === 'completed' &&
    event.repository?.full_name === repository && String(event.repository?.id) === String(repositoryId) &&
    event.workflow_run?.id === request.id && event.workflow_run?.run_attempt === request.run_attempt &&
    event.workflow_run?.head_sha === request.head_sha, 'Server handler is unrelated to its exact request attempt.');
  const release = await journal.assertActive();
  assert(release, 'The originating release journal is missing.');
  const plan = verifyPlan(await readAsset(journal.transport, release, 'plan.json'));
  assert(plan.runId === journal.runId && plan.repository === repository && plan.source === release.target_commitish &&
    plan.digest === inputs.plan_digest && plan.serverBump === inputs.bump, 'Server request differs from the retained immutable plan.');
  const prefix = `/repos/${repository}/actions/runs`;
  const parent = await api(`${prefix}/${plan.runId}`);
  assert(sameRepository(parent) && parent.event === 'workflow_run' && parent.path === '.github/workflows/unified-release-handler.yml' &&
    parent.head_sha === plan.source && String(parent.id) === plan.runId && !['cancelled', 'timed_out'].includes(parent.conclusion),
  'The originating protected handler is absent, cancelled or unrelated.');
  assert(/^[1-9]\d*$/.test(plan.requestRunId) && Number.isSafeInteger(plan.requestRunAttempt) && plan.requestRunAttempt > 0,
    'Original manual request identity is missing.');
  const manual = await api(`${prefix}/${plan.requestRunId}/attempts/${plan.requestRunAttempt}`);
  const origin = manualReleaseContext(manual, repository);
  assert(origin.source === plan.source && origin.runId === plan.requestRunId && manual.run_attempt === plan.requestRunAttempt &&
    manual.status === 'completed' && manual.conclusion === 'success', 'Original manual release authority differs.');
  const merge = await readAsset(journal.transport, release, 'merge.json');
  await verifySource({ root, plan, source: workflowSha, merge });
  const identity = serverHandoffIdentity({ plan, source: workflowSha });
  assert.equal(request.display_title, identity.title, 'Server request correlation differs.');
  const operation = await journal.operation('server');
  assert(operation?.binding === hash(identity) && ['intent', 'running'].includes(operation.status) &&
    (operation.status !== 'running' || operation.ids.at(-1) === String(request.id)),
  'Server publication requires the exact durable originating operation intent.');
  // Every earlier native/OTA stage must have persisted verified completion first.
  for (const stage of plan.stages.slice(0, -1)) {
    const state = await journal.operation(stage.key);
    const receipt = await readAsset(journal.transport, release, `receipt.${stage.key}.json`);
    assert(state?.status === 'complete' && receipt?.key === stage.key && receipt.id === state.ids.at(-1) &&
      receipt.identity === state.binding && hash(receipt.receipt) === hash(state.result),
    'A prior selected artifact is not durably complete.');
  }
  return { source: workflowSha, bump: plan.serverBump, planDigest: plan.digest, parentRunId: plan.runId, selective: true };
}

export async function runServerHandoffCli(argv = process.argv.slice(2), environment = process.env) {
  assert.deepEqual(argv, ['verify'], 'Usage: release-server-handoff.mjs verify');
  const { GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId, GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: runAttempt, WORKFLOW_SHA: workflowSha } = environment;
  assert(/^[1-9]\d*$/.test(runId) && /^[1-9]\d*$/.test(runAttempt) && environment.GITHUB_REF === 'refs/heads/master',
    'Missing protected server handler identity.');
  const event = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
  assert(Number.isSafeInteger(event.workflow_run?.id) && event.workflow_run.id > 0 &&
    Number.isSafeInteger(event.workflow_run?.run_attempt) && event.workflow_run.run_attempt > 0, 'Missing server request attempt.');
  const api = releaseGithubApi({ repository, token: environment.GITHUB_TOKEN });
  const prefix = `/repos/${repository}`;
  const request = await api(`${prefix}/actions/runs/${event.workflow_run.id}/attempts/${event.workflow_run.run_attempt}`);
  const handler = await api(`${prefix}/actions/runs/${runId}/attempts/${runAttempt}`);
  assert(String(handler.id) === runId && handler.run_attempt === Number(runAttempt), 'Handler API attempt differs.');
  const inputs = verifyReleaseRequestArtifact({ artifactDirectory: environment.REQUEST_DIRECTORY,
    operation: 'unified-server-release', repository, repositoryId, runId: String(request.id), runAttempt: String(request.run_attempt),
    headBranch: request.head_branch, headSha: request.head_sha });
  const journal = new ReleaseJournal(githubJournalTransport({ repository, token: environment.GITHUB_TOKEN }), inputs.parent_run_id);
  const currentMaster = (await api(`${prefix}/git/ref/heads/master`)).object.sha;
  const result = await verifyServerHandoff({ root: process.cwd(), repository, repositoryId, workflowSha,
    event, request, handler, inputs, journal, api, currentMaster });
  assert.equal((await api(`${prefix}/git/ref/heads/master`)).object.sha, currentMaster, 'Master advanced during server admission.');
  fs.appendFileSync(environment.GITHUB_OUTPUT, `source_sha=${result.source}\nbump=${result.bump}\nplan_digest=${result.planDigest}\nparent_run_id=${result.parentRunId}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runServerHandoffCli().catch(error => { console.error(error.message); process.exitCode = 1; });
}
