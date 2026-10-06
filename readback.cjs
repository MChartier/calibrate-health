const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const api = (endpoint) => JSON.parse(execFileSync('gh', ['api', `repos/MChartier/calibrate-health/${endpoint}`], { encoding: 'utf8' }));
const pages = (endpoint) => JSON.parse(execFileSync('gh', ['api', `repos/MChartier/calibrate-health/${endpoint}`, '--paginate', '--slurp'], { encoding: 'utf8' })).flat();
const pr = api('pulls/429');
const commits = pages('pulls/429/commits');
const files = pages('pulls/429/files');
if (commits.length !== pr.commits || files.length !== pr.changed_files) throw new Error('Incomplete published scope inventory');
const evidenceCommit = '391c3f2fc5e4d579977d2fffe24d66b75037f3f7';
const evidence = ['README.md', 'observe.cjs', 'observation.json'].map((file) => {
  const remote = execFileSync('gh', ['api', `repos/MChartier/calibrate-health/contents/${file}?ref=${evidenceCommit}`, '-H', 'Accept: application/vnd.github.raw+json']);
  const local = execFileSync('git', ['show', `${evidenceCommit}:${file}`], { cwd: __dirname });
  if (!remote.equals(local)) throw new Error(`Evidence readback mismatch: ${file}`);
  return { file, sha256: hash(remote) };
});
const receipt = {
  checkedAtUtc: new Date().toISOString(), repository: 'MChartier/calibrate-health', pullRequest: pr.html_url,
  head: pr.head.sha, base: pr.base.sha, baseRef: pr.base.ref, ultimateTarget: 'master',
  parent: api('pulls/423').head.sha, mergeBase: pr.base.sha,
  prBodySha256: hash(Buffer.from(pr.body, 'utf8')), draft: pr.draft,
  commits: commits.map(({ sha, parents, commit }) => ({ sha, parents: parents.map(({sha}) => sha), message: commit.message })),
  files: files.map(({ filename, previous_filename, status, additions, deletions }) => ({ filename, previous_filename, status, additions, deletions })),
  totals: { commits: pr.commits, files: pr.changed_files, additions: pr.additions, deletions: pr.deletions },
  evidenceCommit, evidence,
  checks: api(`commits/${pr.head.sha}/check-runs?per_page=100`).check_runs.map(({name,status,conclusion,html_url}) => ({name,status,conclusion,url:html_url})),
  reviewComments: pages('pulls/429/comments'), reviews: pages('pulls/429/reviews'),
  comments: pages('issues/429/comments').map(({id,body,html_url}) => ({id,body,url:html_url})),
  presentation: 'API-decoded final body read: concise summary, behavior table, immutable evidence and guide links. No current rendered pixel inspection claimed; genuinely non-UI configuration change. Earlier browser kernel failed at sandbox startup. Independent QA explicitly accepted the non-UI presentation method, with SSL correctness requiring reassessment.',
  independentQa: 'Required; not performed by implementation owner.'
};
fs.writeFileSync(path.join(__dirname, process.argv[2] ?? 'published-readback.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({head:receipt.head,base:receipt.base,bodySha256:receipt.prBodySha256,totals:receipt.totals,checks:receipt.checks.filter(c=>c.conclusion!=='skipped')}, null, 2));
