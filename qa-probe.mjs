import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { REQUIRED_CI, assertIdentity, evaluateRuns, githubApi, inspectCi, waitForCi } from './review/scripts/release-ci-gate.mjs';

const identity = { repository: 'owner/repo', head: 'a'.repeat(40), base: 'b'.repeat(40), branch: 'release/v1.2.3', number: '12' };
function fixture() {
  const repo = { full_name: identity.repository };
  const pull = { state: 'open', merged: false, draft: false,
    head: { sha: identity.head, ref: identity.branch, repo }, base: { sha: identity.base, ref: 'master', repo } };
  const master = { object: { sha: identity.base } };
  const runs = Object.entries(REQUIRED_CI).map(([file, names], index) => ({
    id: index + 1, path: `.github/workflows/${file}`, event: 'pull_request',
    head_sha: identity.head, head_branch: identity.branch, head_repository: repo,
    status: 'completed', conclusion: 'success', run_attempt: 1, html_url: `https://github.com/owner/repo/actions/runs/${index + 1}`,
    jobs: names.map(name => ({ name, status: 'completed', conclusion: 'success' })),
  }));
  const api = async path => {
    if (path.includes('/pulls/')) return pull;
    if (path.endsWith('/git/ref/heads/master')) return master;
    if (path.includes('/actions/runs?')) return structuredClone(runs);
    const id = Number(path.match(/\/runs\/(\d+)/)?.[1]);
    const run = runs.find(item => item.id === id);
    if (path.includes('/jobs?')) return run.jobs;
    if (run) return run;
    throw new Error(`Unexpected request ${path}`);
  };
  return { pull, master, runs, api };
}


const stale = fixture();
for (const run of stale.runs) run.pull_requests = [{number:99,head:{sha:identity.head},base:{sha:'c'.repeat(40),ref:'other'}}];
console.log('WRONG_PR_AND_BASE_ACCEPTED', (await inspectCi(stale.api, identity)).pending.length === 0);
const raced = fixture();
let reads = 0;
const api = async path => {
 if (path.endsWith('/git/ref/heads/master')) reads++;
 const result = await raced.api(path);
 if (path.includes('/actions/runs?')) raced.master.object.sha = 'd'.repeat(40);
 return result;
};
console.log('MASTER_CHANGED_DURING_READ_ACCEPTED', (await inspectCi(api, identity)).pending.length === 0, 'masterReads', reads);
