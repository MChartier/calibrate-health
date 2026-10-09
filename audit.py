import json,pathlib,subprocess,hashlib,base64,datetime,re
r=pathlib.Path(__file__).resolve().parent;c=r.parent/'calibrate-auth-qa';repo='MChartier/calibrate-health'
def git(*a):return subprocess.check_output(['git',*a],cwd=c).decode().strip()
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
def save(n,v): (r/n).write_bytes((json.dumps(v,indent=2)+'\n').encode())
def raw(ref,p):return subprocess.check_output(['git','show',ref+':'+p],cwd=c)
d=json.loads((r/'initial.json').read_bytes());h=d['pr']['head']['sha'];t=d['master']['sha'];b=git('merge-base',h,t)
assert (h,t,b)==('cd8932b24b76af564d7e50f69750dba8f44c8e68','547206a1b372b73fc95fc412ad453b8099440000','4cbcbc740fbe5fa5646b4de31951c79a653176d5')
published=git('rev-list','--reverse',t+'..'+h).splitlines();assert published==[x['sha'] for x in d['commits']]
paths=git('diff','--name-only',b,h).splitlines();assert set(paths)=={x['filename'] for x in d['files']};assert len(paths)==30
incoming=git('diff','--name-only',b,t).splitlines();assert len(incoming)==37 and not set(paths)&set(incoming)
assert len(git('diff','--name-only','9dc0739e36168aa273530fe00ae5f85fb9c8a3fe',t).splitlines())==29
commits=[]
for s in git('rev-list','--reverse',b+'..'+t).splitlines():commits.append({'sha':s,'parents':git('show','-s','--format=%P',s).split(),'subject':git('show','-s','--format=%s',s),'pathsAgainstFirstParent':git('diff','--name-status',s+'^1',s).splitlines()})
tree=git('merge-tree','--write-tree',t,h)
for p in paths:assert git('ls-tree',tree,'--',p)==git('ls-tree',h,'--',p)
for p in incoming:assert git('ls-tree',tree,'--',p)==git('ls-tree',t,'--',p)
prior=json.loads((r.parent/'recheck441/verdict.json').read_bytes());critical=[]
for x in prior['criticalUnchanged']:
 p=x['path'];assert git('rev-parse',h+':'+p)==git('rev-parse',t+':'+p)==x['headAndActualTargetBlob'];critical.append(x)
receipts=[]
for old in json.loads((r.parent/'recheck441/verification.json').read_bytes())['historicalReceipts']+[json.loads((r.parent/'recheck441/trusted-receipt.json').read_bytes())]:
 x=api('issues/comments/'+str(old['verdictCommentId']));assert hashlib.sha256(x['body'].encode()).hexdigest()==old['verdictBodySha256'];assert x['updated_at']==old['verdictUpdatedAt'];receipts.append({k:old[k] for k in ['verdictCommentId','verdictBodySha256','verdictUpdatedAt']})
ids=[]
for sha in ['73c205a142ec34d8afc76413aa720d63a6a09ce9','9e31053a081b66fe43be5091342c1167e5a1b063']:
 tr=api('git/trees/'+sha+'?recursive=1');assert not tr['truncated']
 for x in tr['tree']:
  if x['type']!='blob':continue
  z=api('git/blobs/'+x['sha']);data=base64.b64decode(z['content']);assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==x['sha'];dest=r/'owner'/sha/x['path'];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);ids.append({'commit':sha,'path':x['path'],'gitBlobSha':x['sha'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
save('identities.json',ids)
assert next(x for x in ids if x['path']=='impact.json')['sha256']=='6f42f3d1434217f2325032e91948b1f8e8c4b3f216d622c19b452d2e2b4f9859'
assert next(x for x in ids if x['path']=='receipt.json')['sha256']=='8ea9c9a5cd9b06b284994f9d41350bba54e0290a640a30a68cd3b2928d618b33'
oldIssue=json.loads((r.parent/'recheck441/initial.json').read_bytes())['issue']['body'];archive=next(x for x in d['issueComments'] if x['id']==6073919842)['body'];assert archive.endswith(oldIssue)
assert d['issue']['body'].split('## Implementing Codex task')[0]==oldIssue.split('## Implementing Codex task')[0]
assert d['issue']['body'].split('## Implementing PR')[1]==oldIssue.split('## Implementing PR')[1]
runs=[]
for n in sorted(set(re.search(r'/actions/runs/(\d+)',x['details_url']).group(1) for x in d['checks']['check_runs'])):
 x=api('actions/runs/'+n);assert x['head_sha']==h and x['conclusion']=='success';runs.append(x)
assert len(runs)==5
issue=api('issues/457');save('issue457.json',issue);save('issue457-comments.json',api('issues/457/comments?per_page=100'))
child=api('pulls/452');candidate=api('pulls/455');save('child452.json',child);save('candidate455.json',candidate)
subprocess.check_call(['git','fetch','origin',child['head']['sha'],candidate['head']['sha']],cwd=c)
relation=[]
for p in ['scripts/release-ci-gate.mjs','.github/workflows/cut-release.yml','scripts/postgres-goal-pace-smoke.mjs']:
 try:relation.append({'path':p,'headBlob':git('rev-parse',h+':'+p),'masterBlob':git('rev-parse',t+':'+p),'childBlob':git('rev-parse',child['head']['sha']+':'+p),'candidateBlob':git('rev-parse',candidate['head']['sha']+':'+p)})
 except subprocess.CalledProcessError:pass
for n in ['37880190066','37880437998']:
 save('run-'+n+'.json',api('actions/runs/'+n));save('jobs-'+n+'.json',api('actions/runs/'+n+'/jobs?per_page=100'))
for n in ['113658571223','113665062675']:
 z=subprocess.run(['gh','api','repos/'+repo+'/actions/jobs/'+n+'/logs'],capture_output=True);(r/('job-'+n+'.log')).write_bytes(z.stdout if z.returncode==0 else z.stderr)
v={'headSha':h,'baseSha':t,'apiBaseSha':d['pr']['base']['sha'],'mergeBaseSha':b,'ultimateTargetSha':t,'headParents':git('show','-s','--format=%P',h).split(),'targetParents':git('show','-s','--format=%P',t).split(),'parentRevisions':[],'scope':{'commits':d['commits'],'files':d['files'],'additions':sum(x['additions'] for x in d['files']),'deletions':sum(x['deletions'] for x in d['files'])},'incomingCommits':commits,'incomingPaths':incoming,'conflictProbe':{'tree':tree,'allPrAndIncomingBlobsPreserved':True,'runtimeExecution':False},'criticalUnchanged':critical,'historicalReceipts':receipts,'workflowRuns':runs,'checkSummary':{c:sum(x['conclusion']==c for x in d['checks']['check_runs']) for c in ['success','skipped']},'issueOriginalExactArchiveVerified':6073919842,'releaseRelationship':relation,'workingTree':git('status','--porcelain')}
save('verification.json',v);print(json.dumps({'published':len(published),'incomingCommits':len(commits),'incomingPaths':len(incoming),'critical':len(critical),'checks':v['checkSummary'],'identities':len(ids),'releaseRelationship':relation}))
