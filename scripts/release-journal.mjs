import assert from 'node:assert/strict';
import { bytes, byteHash, hash, SHA, DIGEST } from './release-plan.mjs';

const keyPattern = /^[a-z0-9][a-z0-9.-]*$/;
const candidateTag = runId => `candidate/unified/${runId}`;
const abandonedTag = runId => `abandoned/unified/${runId}`;
const completedTag = runId => `completed/unified/${runId}`;

function operationTransition(previous, current) {
  assert(DIGEST.test(current.binding) && ['intent', 'running', 'failed', 'complete'].includes(current.status) &&
    Array.isArray(current.ids) && current.ids.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(current.ids).size === current.ids.length, 'Invalid operation state.');
  if (!previous) assert(current.status === 'intent' && current.ids.length === 0, 'Operation must start with durable intent.');
  else {
    assert(current.binding === previous.binding && current.ids.slice(0, previous.ids.length).join('\0') === previous.ids.join('\0'),
      'Operation binding or retained provider IDs changed.');
    const allowed = { intent: ['running'], running: ['failed', 'complete'], failed: ['intent', 'running'], complete: [] };
    assert(allowed[previous.status].includes(current.status), 'Invalid operation transition.');
    assert(current.ids.length === previous.ids.length + (current.status === 'running' ? 1 : 0), 'Unexpected provider ID transition.');
  }
  if (current.status === 'complete') assert(current.result && typeof current.result === 'object', 'Completed operation lacks a verified result.');
}

/** Transport methods must return complete inventories, and never overwrite or delete assets. */
export class ReleaseJournal {
  constructor(transport, runId) {
    assert(/^[1-9]\d*$/.test(runId), 'Invalid release run ID.');
    this.transport = transport;
    this.runId = runId;
  }
  async release() {
    const matches = (await this.transport.releases()).filter(r => [candidateTag(this.runId), abandonedTag(this.runId), completedTag(this.runId)].includes(r.tag_name));
    assert(matches.length <= 1, 'Duplicate journal identity; reconcile before proceeding.');
    if (matches.length) assert(matches[0].author?.login === 'github-actions[bot]', 'Journal ownership differs.');
    return matches[0];
  }
  async assertActive() {
    const release = await this.release();
    if (release) assert(release.draft && release.tag_name === candidateTag(this.runId) &&
      !release.assets.some(a => a.name === 'retirement.json'), 'Release is completed, abandoned or retiring. Never restart its run ID.');
    return release;
  }
  async create(source) {
    assert(SHA.test(source), 'Journal requires exact source.');
    await this.assertActive();
    for (const r of await this.transport.releases()) {
      if (/^abandoned\/unified\/\d+$/.test(r.tag_name)) await verifyRetirement(this.transport, r);
      if (/^candidate\/unified\/\d+$/.test(r.tag_name) && r.tag_name !== candidateTag(this.runId)) {
        throw Error('Another unresolved release is blocking across all profiles.');
      }
    }
    let release = await this.release();
    if (!release) {
      await this.transport.create({ tag_name: candidateTag(this.runId), target_commitish: source, draft: true,
        name: `Unified release candidate ${this.runId}`, body: 'Durable release journal. Not a completed release or artifact baseline.' });
      release = await this.release();
    }
    assert(release?.target_commitish === source && release.draft, 'Journal creation/readback identity differs.');
    return release;
  }
  async read(name) { return readAsset(this.transport, await this.assertActive(), name); }
  async put(name, value) {
    const release = await this.assertActive();
    assert(release, 'Create the journal before recording work.');
    return putAsset(this.transport, release, name, value);
  }
  async operation(key) {
    assert(keyPattern.test(key), 'Invalid operation key.');
    const release = await this.assertActive();
    const names = (release?.assets ?? []).map(a => a.name).filter(n => n.startsWith(`op.${key}.`) && /\.\d{6}\.json$/.test(n)).sort();
    let previous;
    for (let i = 0; i < names.length; i++) {
      const current = await readAsset(this.transport, release, names[i]);
      assert(names[i] === `op.${key}.${String(i + 1).padStart(6, '0')}.json` && current.schema === 1 &&
        current.sequence === i + 1 && current.key === key && current.previous === (previous ? hash(previous) : null), 'Operation history is incomplete or changed.');
      operationTransition(previous, current);
      previous = current;
    }
    return previous;
  }
  async save(value) {
    const previous = await this.operation(value.key);
    operationTransition(previous, value);
    const next = { ...value, schema: 1, sequence: (previous?.sequence ?? 0) + 1, previous: previous ? hash(previous) : null };
    assert(next.sequence <= 999999, 'Operation history exhausted.');
    await this.put(`op.${value.key}.${String(next.sequence).padStart(6, '0')}.json`, next);
    return next;
  }
  async finish(planDigest, results) {
    let release = await this.release();
    assert(release?.draft && DIGEST.test(planDigest), 'Completion requires an exact retained plan.');
    const completion = { schema: 1, runId: this.runId, planDigest, results };
    if (release.tag_name === completedTag(this.runId)) {
      assert.deepEqual(await readAsset(this.transport, release, 'completion.json'), completion, 'Completed journal differs from verified results.');
      return completion;
    }
    await this.assertActive();
    await this.put('completion.json', completion);
    release = await this.release();
    await this.transport.rename(release.id, completedTag(this.runId));
    release = await this.release();
    assert(release.tag_name === completedTag(this.runId), 'Completion rename readback failed.');
    assert.deepEqual(await readAsset(this.transport, release, 'completion.json'), completion, 'Completion bytes changed.');
    return completion;
  }
}

export async function readAsset(transport, release, name) {
  if (!release) return undefined;
  const matches = release.assets.filter(a => a.name === name);
  assert(matches.length <= 1, 'Duplicate journal asset name.');
  if (!matches.length) return undefined;
  const asset = matches[0];
  const content = Buffer.from(await transport.download(asset.id));
  assert(asset.digest === `sha256:${byteHash(content)}` && content.length === asset.size, 'Journal asset exact-byte digest/size differs.');
  return JSON.parse(content.toString('utf8'));
}

export async function putAsset(transport, release, name, value) {
  assert(/^[a-z0-9][a-z0-9.-]*\.json$/.test(name), 'Invalid journal asset name.');
  const content = bytes(value);
  const fresh = await transport.release(release.id);
  assert(fresh.id === release.id && fresh.tag_name === release.tag_name && fresh.draft === true &&
    fresh.author?.login === 'github-actions[bot]', 'Journal changed before upload.');
  if (!['retirement.json', 'retirement-complete.json'].includes(name)) {
    assert(fresh.tag_name.startsWith('candidate/unified/') && !fresh.assets.some(a => a.name === 'retirement.json'), 'Journal is retiring before upload.');
  }
  const previous = await readAsset(transport, fresh, name);
  if (previous !== undefined) {
    assert.equal(hash(previous), hash(value), 'Immutable journal asset conflicts.');
    return;
  }
  await transport.upload(release.id, name, content);
  const readback = await transport.release(release.id);
  assert.equal(hash(await readAsset(transport, readback, name)), hash(value), 'Journal upload readback failed.');
}

export async function verifyRetirement(transport, release, complete = true) {
  const record = await readAsset(transport, release, 'retirement.json');
  assert(record?.schema === 1 && record.releaseId === release.id && release.draft && release.author?.login === 'github-actions[bot]' &&
    release.tag_name === abandonedTag(record.runId), 'Retired journal identity is uncertain.');
  assert(Array.isArray(record.assets), 'Retired asset inventory is missing.');
  for (const original of record.assets) {
    const asset = release.assets.find(a => a.id === original.id && a.name === original.name);
    assert(asset && asset.digest === original.digest && asset.size === original.size, 'Retained original asset changed or disappeared.');
    await readAsset(transport, release, original.name);
  }
  assert(release.assets.every(a => ['retirement.json', 'retirement-complete.json'].includes(a.name) ||
    record.assets.some(old => old.id === a.id && old.name === a.name)), 'Unexpected retired assets require reconciliation.');
  if (complete) assert.equal((await readAsset(transport, release, 'retirement-complete.json'))?.retirementHash,
    hash(record), 'Retirement cleanup readback is incomplete.');
  return record;
}

/** GitHub-only adapter. Provider credentials never enter this journal transport. */
export function githubJournalTransport({ repository, token, fetchImpl = fetch }) {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && token, 'Journal requires repository and scoped token.');
  const root = `https://api.github.com/repos/${repository}`;
  async function request(url, { method = 'GET', body, binary = false } = {}) {
    const response = await fetchImpl(url, { method, headers: {
      Authorization: `Bearer ${token}`, Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {})
    }, body: body ? Buffer.isBuffer(body) ? body : JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    assert(response.ok, `Journal API ${method} failed (${response.status}); reconcile before retrying.`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.status === 204 ? undefined : response.json();
  }
  async function pages(url) {
    const result = [];
    for (let page = 1; page <= 1000; page++) {
      const values = await request(`${url}?per_page=100&page=${page}`);
      assert(Array.isArray(values), 'Journal inventory is incomplete.');
      result.push(...values);
      if (values.length < 100) return result;
    }
    throw Error('Journal inventory exceeds the complete-read bound.');
  }
  async function release(id) {
    assert(Number.isSafeInteger(id) && id > 0, 'Invalid journal release ID.');
    const value = await request(`${root}/releases/${id}`);
    value.assets = await pages(`${root}/releases/${id}/assets`);
    return value;
  }
  return {
    release,
    releases: async () => Promise.all((await pages(`${root}/releases`)).filter(r =>
      /^(candidate|abandoned|completed)\/unified\/\d+$/.test(r.tag_name)).map(r => release(r.id))),
    create: body => request(`${root}/releases`, { method: 'POST', body }),
    download: id => request(`${root}/releases/assets/${id}`, { binary: true }),
    upload: (id, name, body) => request(`https://uploads.github.com/repos/${repository}/releases/${id}/assets?name=${encodeURIComponent(name)}`,
      { method: 'POST', body }),
    rename: (id, tag_name) => request(`${root}/releases/${id}`, { method: 'PATCH', body: { tag_name } })
  };
}
