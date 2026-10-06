import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only canonical version-mirror candidates reach this gate. Builds intentionally
// suppresses platform fan-out; database rollback requires an actual migration.
export const REQUIRED_CI = {
  'lint.yml': ['Backend, Shared, API Client, and Mobile Typecheck'],
  'tests.yml': ['Classify Test Inputs', 'Backend Tests', 'Mobile Tests'],
  'builds.yml': ['Classify Build Inputs', 'Release Configuration'],
  'container-scan.yml': ['Classify Production Image Inputs', 'High and Critical Vulnerabilities'],
  'database-upgrade.yml': ['Classify Database Inputs', 'Populated Postgres Upgrade'],
};
const ALLOWED_SKIPS = {
  'builds.yml': [
    'Backend Build', 'Expo Web Build', 'Web Critical Smoke',
    'Full Exported Web and PWA End-to-End', 'Six-State Data-Backed Route Acceptance',
    'UX Accessibility and Visual Regression', '${{ matrix.platform }} Runtime Bundle',
    'Mobile Build', 'iOS Build', 'Wear Build and JVM Tests',
    'Android Emulator End-to-End', 'Wear Release Emulator Smoke', 'Native Two-Emulator Package Upgrade',
  ],
  'database-upgrade.yml': ['v0.14.0 Upgrade and Encrypted Rollback'],
};

export function assertIdentity({ pull, master }, identity) {
  const { repository, head, base, branch } = identity;
  if (pull.state !== 'open' || pull.merged || pull.draft ||
      pull.head?.sha !== head || pull.head?.ref !== branch ||
      pull.head?.repo?.full_name !== repository || pull.base?.repo?.full_name !== repository ||
      pull.base?.ref !== 'master' || pull.base?.sha !== base || master.object?.sha !== base) {
    throw new Error('Release PR/head/base changed; no merge permitted. Inspect the candidate before recovery.');
  }
}

export function evaluateRuns(runs, identity) {
  const selected = [];
  const pending = [];
  for (const [file, requiredJobs] of Object.entries(REQUIRED_CI)) {
    const candidates = runs.filter(run => run.path === `.github/workflows/${file}` &&
      run.event === 'pull_request' && run.head_sha === identity.head &&
      run.head_branch === identity.branch && run.head_repository?.full_name === identity.repository);
    const run = candidates.sort((a, b) => b.id - a.id)[0];
    if (!run || run.status !== 'completed') {
      pending.push(`${file}: ${run?.status ?? 'missing'}${run ? ` (${run.html_url})` : ''}`);
      continue;
    }
    if (run.conclusion !== 'success') {
      throw new Error(`${file}: ${run.conclusion}; inspect ${run.html_url}, including approval/no-job annotations.`);
    }
    const jobs = run.jobs ?? [];
    for (const name of requiredJobs) {
      if (!jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success')) {
        throw new Error(`${file}: required job ${name} did not succeed (${run.html_url}).`);
      }
    }
    for (const job of jobs) {
      if (job.status !== 'completed' || (job.conclusion !== 'success' &&
          !(job.conclusion === 'skipped' && ALLOWED_SKIPS[file]?.includes(job.name)))) {
        throw new Error(`${file}: unacceptable job ${job.name}: ${job.conclusion} (${run.html_url}).`);
      }
    }
    selected.push(run);
  }
  return { selected, pending };
}

export async function inspectCi(api, identity) {
  const root = `/repos/${identity.repository}`;
  const pull = await api(`${root}/pulls/${identity.number}`);
  const master = await api(`${root}/git/ref/heads/master`);
  assertIdentity({ pull, master }, identity);
  const runs = await api(`${root}/actions/runs?head_sha=${identity.head}&event=pull_request&per_page=100`, 'workflow_runs');
  // Never fall back to an older passing run if a newer attempt is pending/failing.
  for (const file of Object.keys(REQUIRED_CI)) {
    const latest = runs.filter(run => run.path === `.github/workflows/${file}` &&
      run.event === 'pull_request' && run.head_sha === identity.head &&
      run.head_branch === identity.branch && run.head_repository?.full_name === identity.repository)
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.status === 'completed' && latest.conclusion === 'success') {
      latest.jobs = await api(`${root}/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`, 'jobs');
      const fresh = await api(`${root}/actions/runs/${latest.id}`);
      if (fresh.run_attempt !== latest.run_attempt || fresh.status !== latest.status || fresh.conclusion !== latest.conclusion) {
        throw new Error(`CI attempt changed during inspection: ${latest.html_url}. Retry after CI settles.`);
      }
    }
  }
  return evaluateRuns(runs, identity);
}

export async function waitForCi(api, identity, {
  timeoutMs = 40 * 60_000, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), report = console.log,
} = {}) {
  const deadline = now() + timeoutMs;
  let previousPending;
  while (true) {
    const result = await inspectCi(api, identity);
    if (!result.pending.length) {
      report(result.selected.map(run => `${run.path}: success (${run.html_url}, attempt ${run.run_attempt})`).join('\n'));
      return result;
    }
    const pendingMessage = `Waiting for release CI: ${result.pending.join('; ')}`;
    if (pendingMessage !== previousPending) report(pendingMessage);
    previousPending = pendingMessage;
    if (now() >= deadline) throw new Error('CI gate timed out. Approve/repair the exact PR checks, then rerun failed release jobs while refs remain unchanged.');
    await sleep(Math.min(15_000, deadline - now()));
  }
}

export function githubApi({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  return async (path, collection) => {
    const items = [];
    for (let page = 1; page <= 10; page++) {
      const response = await fetchImpl(`${apiUrl}${path}${collection ? `&page=${page}` : ''}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`GitHub CI read failed (${response.status}); no merge permitted.`);
      const data = await response.json();
      if (!collection) return data;
      if (!Array.isArray(data[collection]) || !Number.isInteger(data.total_count)) throw new Error('Incomplete GitHub CI response.');
      items.push(...data[collection]);
      if (items.length === data.total_count) return items;
      if (!data[collection].length || items.length > data.total_count) throw new Error('CI inventory changed or was truncated.');
    }
    throw new Error('CI inventory exceeds the bounded complete-read limit.');
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_REPOSITORY: repository, SOURCE_SHA: base, RELEASE_SHA: head,
    RELEASE_BRANCH: branch, PULL_REQUEST_NUMBER: number, GITHUB_TOKEN: token } = process.env;
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[0-9a-f]{40}$/.test(base ?? '') ||
        !/^[0-9a-f]{40}$/.test(head ?? '') || !/^release\/v\d+\.\d+\.\d+$/.test(branch ?? '') ||
        !/^[1-9]\d*$/.test(number ?? '') || !token) throw new Error('Missing exact release CI identity/token.');
    await waitForCi(githubApi({ token, apiUrl: process.env.GITHUB_API_URL }), { repository, base, head, branch, number }, {
      timeoutMs: process.argv.includes('--once') ? 0 : 40 * 60_000,
      report: message => {
        console.log(message);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
      },
    });
  } catch (error) {
    console.error(error.message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Release CI blocked: ${error.message}\n`);
    process.exitCode = 1;
  }
}
