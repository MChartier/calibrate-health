import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseGithubApi, githubCandidate, gitBlob, verifyAndroidAllocation } from './release-github.mjs';
import { candidateDocuments, CANDIDATE_INPUTS } from './release-candidate.mjs';
import { hash } from './release-plan.mjs';

test('REST adapter scopes credentials, follows complete inventories and distinguishes absence from denial', async () => {
  const calls = [];
  const api = releaseGithubApi({ repository: 'example/app', token: 'synthetic-token', fetchImpl: async (url, request) => {
    calls.push({ url, request });
    if (url.includes('absent')) return { status: 404, ok: false };
    if (url.includes('denied')) return { status: 403, ok: false };
    const page = new URL(url).searchParams.get('page');
    return { ok: true, status: 200, json: async () => ({ total_count: 101, jobs: page === '1' ? Array.from({ length: 100 }, (_, i) => i) : [100] }) };
  } });
  assert.equal((await api('/repos/example/app/actions/runs/1/jobs?filter=all', 'jobs')).length, 101);
  assert(calls[1].url.includes('filter=all') && calls[1].url.includes('page=2'));
  await assert.rejects(api('/repos/other/app/issues'), /escaped/);
  assert.equal(await api('/repos/example/app/absent', null, { allowMissing: true }), undefined);
  await assert.rejects(api('/repos/example/app/denied', null, { allowMissing: true }), /403/);
});

test('Android allocation invokes the maintained signed origin-tag authority before any candidate writes', async () => {
  const calls = [], source = 'a'.repeat(40);
  const manifest = { android: { mobile: { version_name: '1.2.3', native_release_tag: 'native-v1.2.3' }, wear: { version_name: '1.2.3' } } };
  const authority = { latestTag: 'native-v1.2.3', tagCommit: 'b'.repeat(40), tagObject: 'c'.repeat(40), trustSetCommit: source };
  const args = { root: '.', request: { android: true, source },
    git: args => { calls.push(args); return args[0] === 'show' ? JSON.stringify(manifest) : ''; },
    verifyTag: async options => { assert.equal(options.expectedTag, 'native-v1.2.3'); return authority; } };
  assert.deepEqual(await verifyAndroidAllocation(args), authority);
  assert.deepEqual(calls.at(-1), ['merge-base', '--is-ancestor', authority.tagCommit, source]);
  await assert.rejects(verifyAndroidAllocation({ ...args, verifyTag: async () => { throw Error('unsigned tag'); } }), /unsigned/);
  authority.latestTag = 'native-v1.2.4'; await assert.rejects(verifyAndroidAllocation(args), /signed baseline/);
  let writes = 0;
  const worker = githubCandidate({ ...args, repository: 'example/app', api: async () => { writes++; },
    verifyTag: async () => { throw Error('unpublished tag'); } });
  await assert.rejects(worker.prepare({ request: args.request, journal: { read: async () => undefined } }), /unpublished/);
  assert.equal(writes, 0);
  assert.equal(await verifyAndroidAllocation({ ...args, request: { android: false }, verifyTag: () => { throw Error('not selected'); } }), undefined);
});

async function fixture() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = 'a'.repeat(40), commit = 'b'.repeat(40), merge = 'c'.repeat(40), tree = 'd'.repeat(40), repository = 'example/app';
  const request = { schema: 1, runId: '10', planDigest: hash('plan'), source, android: false, ios: true, serverBump: null };
  const originals = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
  const documents = await candidateDocuments(originals, request);
  const entries = values => Object.entries(values).map(([name, content]) => ({ path: name, mode: '100644', type: 'blob', sha: gitBlob(content) }));
  const before = entries(originals), after = entries({ ...originals, ...documents });
  const candidate = { source, commit, tree }, state = { merged: false, drift: false }, writes = [];
  const pull = () => ({ number: 1, state: state.merged ? 'closed' : 'open', merged: state.merged, draft: false,
    merge_commit_sha: state.merged ? merge : null, auto_merge: null, user: { login: 'github-actions[bot]' },
    head: { sha: commit, ref: 'release/unified-10', repo: { full_name: repository } },
    base: { sha: source, ref: 'master', repo: { full_name: repository } } });
  const api = async (route, _field, options) => {
    if (options?.method) { writes.push({ route, options }); throw Error('No GitHub writes expected'); }
    if (route.includes('/git/commits/')) return route.endsWith(commit)
      ? { sha: commit, parents: [{ sha: source }], tree: { sha: tree } }
      : { sha: merge, parents: [{ sha: source }, { sha: commit }], tree: { sha: state.drift ? 'e'.repeat(40) : tree } };
    if (route.includes('/git/trees/')) return { truncated: false, tree: route.includes(source) ? before : after };
    if (route.includes('/git/ref/heads/master')) return { object: { sha: state.merged ? merge : source } };
    if (route.includes('/pulls?')) return [pull()];
    if (route.endsWith('/pulls/1')) return pull();
    if (route.includes('/actions/runs?')) return [];
    throw Error('Unexpected test request: ' + route);
  };
  const journal = { read: async () => candidate, put: async (name, value) => writes.push({ name, value }) };
  const worker = githubCandidate({ root, repository, api, git: args => originals[args[1].split(':')[1]] });
  return { worker, request, candidate, journal, state, writes, after };
}

test('native candidate verification rejects extra payload in an otherwise allowed metadata file', async () => {
  const f = await fixture(); await f.worker.verify(f.candidate, f.request);
  f.after.find(entry => entry.path === 'mobile/app.json').sha = gitBlob('unreviewed payload');
  await assert.rejects(f.worker.verify(f.candidate, f.request), /exact metadata/);
});

test('missing exact candidate CI retains the PR without a merge API call', async () => {
  const f = await fixture();
  await assert.rejects(f.worker.finalize(f), /CI is missing or pending/);
  assert.deepEqual(f.writes, []);
});

test('lost merge response reconciles exact parents/tree/master without creating another candidate', async () => {
  const f = await fixture(); f.state.merged = true;
  assert.deepEqual(await f.worker.prepare({ request: f.request, journal: f.journal }), f.candidate);
  const merged = await f.worker.finalize(f);
  assert.equal(merged.source, 'c'.repeat(40)); assert.equal(f.writes.length, 1); assert.equal(f.writes[0].name, 'merge.json');
  f.state.drift = true;
  await assert.rejects(f.worker.finalize(f), /merge tree differs/);
});
