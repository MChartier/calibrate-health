const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out=__dirname,root=path.resolve(out,'../managed-clone-438-01a11c7b'),retained=path.resolve(out,'../retained-438-01a11c7b/managed-438');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidence='a7d2ad1648d2b743cdfda5ef66950f6feee741ad';
const manifests=JSON.parse(fs.readFileSync(path.join(retained,'artifact-digests.json'),'utf8'));
for(const item of manifests){const bytes=execFileSync('git',['cat-file','blob',evidence+':managed-438/'+item.path],{cwd:root,maxBuffer:10*1024*1024});if(hash(bytes)!==item.sha256)throw new Error('Retained original mismatch: '+item.path);}
const published=JSON.parse(fs.readFileSync(path.join(out,'published-readback.json'),'utf8').replace(/^\uFEFF/,''));
published.commits=Array.isArray(published.commits)?published.commits:[published.commits];
const pr=JSON.parse(fs.readFileSync(path.join(out,'pr-api-readback.json'),'utf8'));
const scope=JSON.parse(fs.readFileSync(path.join(retained,'scope.json'),'utf8'));
const livePaths=published.files.map(f=>f.filename).sort();
if(JSON.stringify(livePaths)!==JSON.stringify(scope.paths.map(f=>f.path).sort()))throw new Error('Published path inventory mismatch');
if(published.commits.length!==1||published.commits[0].sha!==pr.head_sha||published.commits[0].parents.length!==1||published.commits[0].parents[0].sha!==pr.base_sha)throw new Error('Published commit/parent mismatch');
const totals=published.files.reduce((s,f)=>({additions:s.additions+f.additions,deletions:s.deletions+f.deletions}),{additions:0,deletions:0});
if(totals.additions!==scope.totals.additions||totals.deletions!==scope.totals.deletions)throw new Error('Published totals mismatch');
const result={checkedAtUtc:new Date().toISOString(),repository:'MChartier/calibrate-health',pullRequest:450,head:pr.head_sha,base:pr.base_sha,headParents:published.commits[0].parents.map(p=>p.sha),parentRevisions:[],prBodySha256:hash(Buffer.from(pr.body,'utf8')),prBodyUpdatedAt:pr.updated_at,productCommits:published.commits.length,productFiles:livePaths.length,...totals,evidenceCommit:evidence,originalFilesByteVerified:manifests.length,provenanceSha256:hash(fs.readFileSync(path.join(retained,'provenance.json'))),provenanceNotesSha256:hash(fs.readFileSync(path.join(retained,'provenance-notes.json'))),fixtureSha256:hash(fs.readFileSync(path.join(retained,'fixture-used.ts'))),nativeIssueAssociation:'GraphQL closingIssuesReferences readback includes issue438',projectCurrentPR:'GraphQL mutation and readback confirmed PR450',readiness:'Not awarded; independent QA pending'};
fs.writeFileSync(path.join(out,'publication-bindings.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
