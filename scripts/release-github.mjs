import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { candidateDocuments, candidateGit, CANDIDATE_INPUTS } from './release-candidate.mjs';
import { inspectCi } from './release-ci-gate.mjs';
import { SHA, hash } from './release-plan.mjs';
import { verifyPublishedNativeReleaseTag } from './release-config.mjs';

/** Scoped REST adapter: complete pagination, explicit absence, no arbitrary URL/credential forwarding. */
export function releaseGithubApi({ repository, token, fetchImpl = fetch }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && token, 'Scoped GitHub repository/token required.');
  const prefix = `/repos/${repository}/`;
  async function request(route, options = {}) {
    assert(route.startsWith(prefix) && !route.includes('..'), 'GitHub request escaped its repository.');
    const response = await fetchImpl(`https://api.github.com${route}`, { method: options.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(30_000) });
    if (options.allowMissing && response.status === 404) return undefined;
    assert(response.ok, `GitHub request failed (${response.status}); retain state for reconciliation.`);
    return response.status === 204 ? undefined : response.json();
  }
  return async (route, field = null, options = {}) => {
    if (!field && !options.paginate) return request(route, options);
    assert(!options.method || options.method === 'GET', 'Pagination cannot mutate.');
    const result = [];
    for (let page = 1; page <= 1000; page++) {
      const url = new URL(`https://api.github.com${route}`);
      url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
      const value = await request(`${url.pathname}${url.search}`, options);
      const rows = field ? value?.[field] : value;
      assert(Array.isArray(rows) && rows.length <= 100, 'Incomplete GitHub inventory.');
      result.push(...rows);
      if (rows.length < 100) {
        if (Number.isSafeInteger(value?.total_count)) assert(result.length === value.total_count, 'GitHub total differs from complete inventory.');
        return result;
      }
    }
    throw Error('GitHub inventory exceeded the complete-read bound.');
  };
}

export const gitBlob = content => {
  const value = Buffer.from(content);
  return createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
};

/** Protected Android allocation retains the original published, signed phone/Wear baseline gate. */
export async function verifyAndroidAllocation({ root, request, git = candidateGit(root), verifyTag = verifyPublishedNativeReleaseTag }) {
  if (!request.android) return;
  assert(SHA.test(request.source), 'Android allocation requires exact source.');
  const manifest = JSON.parse(git(['show', `${request.source}:shared/release.json`]));
  const version = manifest.android.mobile.version_name;
  const expectedTag = `native-v${version}`;
  assert(manifest.android.wear.version_name === version && manifest.android.mobile.native_release_tag === expectedTag,
    'Android phone/Wear baseline version and tag differ.');
  const authority = await verifyTag({ root, expectedTag });
  assert(authority?.latestTag === expectedTag && SHA.test(authority.tagCommit) && SHA.test(authority.tagObject) &&
    SHA.test(authority.trustSetCommit), 'Android allocation lacks its exact published signed baseline authority.');
  git(['merge-base', '--is-ancestor', authority.tagCommit, request.source]);
  return authority;
}

/** Candidate writes carry GitHub authority only. Signing/registry/store credentials stay in worker jobs. */
export function githubCandidate({ root, repository, api, git = candidateGit(root), verifyTag = verifyPublishedNativeReleaseTag,
  waitCi = inspectCi }) {
  const prefix = `/repos/${repository}`;
  const master = async () => (await api(`${prefix}/git/ref/heads/master`)).object.sha;
  async function expected(request) {
    const originals = Object.fromEntries(CANDIDATE_INPUTS.map(name => [name, git(['show', `${request.source}:${name}`])]));
    return candidateDocuments(originals, request);
  }
  async function tree(commit) {
    const value = await api(`${prefix}/git/trees/${commit}?recursive=1`);
    assert(value.truncated === false && Array.isArray(value.tree), 'Candidate tree inventory is truncated.');
    return value.tree.filter(entry => entry.type !== 'tree').sort((a, b) => a.path.localeCompare(b.path));
  }
  async function verify(candidate, request) {
    assert(SHA.test(candidate.commit) && candidate.source === request.source, 'Candidate source identity differs.');
    const commit = await api(`${prefix}/git/commits/${candidate.commit}`);
    assert(commit.sha === candidate.commit && commit.parents?.length === 1 && commit.parents[0].sha === request.source, 'Candidate has unexpected ancestry.');
    const documents = await expected(request), before = await tree(request.source), after = await tree(candidate.commit);
    const wanted = new Map(before.map(entry => [entry.path, { path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha }]));
    for (const [name, contents] of Object.entries(documents)) {
      assert(!wanted.has(name) || wanted.get(name).mode === '100644', 'Candidate input must be a regular non-executable file.');
      wanted.set(name, { path: name, mode: '100644', type: 'blob', sha: gitBlob(contents) });
    }
    assert.deepEqual(after.map(({ path, mode, type, sha }) => ({ path, mode, type, sha })),
      [...wanted.values()].sort((a, b) => a.path.localeCompare(b.path)), 'Candidate tree differs from exact metadata reconstruction.');
    assert.equal(commit.tree.sha, candidate.tree, 'Candidate tree identity changed.');
    return candidate;
  }
  async function pulls(runId) {
    const values = await api(`${prefix}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':release/unified-' + runId)}&base=master`, null, { paginate: true });
    assert(values.length <= 1, 'Duplicate candidate pull requests require reconciliation.');
    return values[0];
  }
  function bindPull(pull, candidate, runId) {
    assert(pull.head?.sha === candidate.commit && pull.head?.ref === `release/unified-${runId}` &&
      pull.head?.repo?.full_name === repository && pull.base?.repo?.full_name === repository && pull.base.ref === 'master' &&
      pull.user?.login === 'github-actions[bot]' && !pull.auto_merge, 'Candidate PR ownership or source changed.');
  }
  return {
    master, verify, pulls,
    prepare: async ({ request, journal, createdAt }) => {
      await verifyAndroidAllocation({ root, request, git, verifyTag });
      const retained = await journal.read('candidate.json');
      if (retained) return verify(retained, request);
      assert.equal(await master(), request.source, 'Protected master advanced before candidate preparation.');
      const branch = `release/unified-${request.runId}`;
      const existing = await api(`${prefix}/git/ref/heads/${branch}`, null, { allowMissing: true });
      let candidate;
      if (existing) {
        const commit = await api(`${prefix}/git/commits/${existing.object.sha}`);
        candidate = { source: request.source, commit: commit.sha, tree: commit.tree.sha };
      } else {
        const documents = await expected(request);
        const source = await api(`${prefix}/git/commits/${request.source}`);
        assert(!Number.isNaN(Date.parse(createdAt)), 'Candidate requires the immutable workflow creation time.');
        const entries = [];
        for (const [name, content] of Object.entries(documents)) {
          const blob = await api(`${prefix}/git/blobs`, null, { method: 'POST', body: { encoding: 'utf-8', content } });
          assert.equal(blob.sha, gitBlob(content), 'GitHub created unexpected candidate blob bytes.');
          entries.push({ path: name, mode: '100644', type: 'blob', sha: blob.sha });
        }
        const nextTree = await api(`${prefix}/git/trees`, null, { method: 'POST', body: { base_tree: source.tree.sha, tree: entries } });
        const actor = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com', date: createdAt };
        const commit = await api(`${prefix}/git/commits`, null, { method: 'POST', body: { message: `Prepare unified release ${request.runId}\n\nPlan: ${request.planDigest}`,
          tree: nextTree.sha, parents: [request.source], author: actor, committer: actor } });
        candidate = { source: request.source, commit: commit.sha, tree: nextTree.sha };
        await verify(candidate, request);
        assert.equal(await master(), request.source, 'Protected master advanced before branch publication.');
        await api(`${prefix}/git/refs`, null, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
      }
      await verify(candidate, request);
      await journal.put('candidate.json', candidate);
      return candidate;
    },
    finalize: async ({ request, candidate, journal }) => {
      await verify(candidate, request);
      let pull = await pulls(request.runId);
      if (!pull) {
        assert.equal(await master(), request.source, 'Protected master advanced before candidate PR.');
        pull = await api(`${prefix}/pulls`, null, { method: 'POST', body: { head: `release/unified-${request.runId}`, base: 'master',
          title: `Prepare unified release ${request.runId}`, body: 'Canonical version metadata for the manually requested release. Exact candidate/base CI must pass before publication.', draft: false } });
      }
      bindPull(pull, candidate, request.runId);
      pull = await api(`${prefix}/pulls/${pull.number}`);
      bindPull(pull, candidate, request.runId);
      if (!pull.merged) {
        await verifyAndroidAllocation({ root, request, git, verifyTag });
        const identity = { repository, head: candidate.commit, base: request.source, branch: `release/unified-${request.runId}`, number: pull.number };
        const ci = await waitCi(api, identity);
        assert.equal(ci.pending.length, 0, 'Exact candidate CI is missing or pending; retain this candidate and rerun after completion.');
        await verify(candidate, request);
        const finalCi = await inspectCi(api, identity);
        assert.equal(finalCi.pending.length, 0, 'Exact candidate CI changed before merge.');
        await api(`${prefix}/pulls/${pull.number}/merge`, null, { method: 'PUT', body: { sha: candidate.commit, merge_method: 'merge' } });
        pull = await api(`${prefix}/pulls/${pull.number}`);
      }
      bindPull(pull, candidate, request.runId);
      assert(pull.merged && SHA.test(pull.merge_commit_sha), 'Candidate merge outcome is uncertain.');
      const merged = await api(`${prefix}/git/commits/${pull.merge_commit_sha}`);
      assert.deepEqual(merged.parents.map(p => p.sha), [request.source, candidate.commit], 'Release merge parents differ.');
      assert.equal(merged.tree.sha, candidate.tree, 'Release merge tree differs from verified candidate.');
      assert.equal(await master(), merged.sha, 'Protected master advanced after candidate merge; reconcile before providers.');
      const result = { source: merged.sha, candidate: candidate.commit, tree: candidate.tree, requestDigest: hash(request), pull: pull.number };
      await journal.put('merge.json', result);
      return result;
    }
  };
}
