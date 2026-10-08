import json,pathlib,subprocess,hashlib,re,datetime
r=pathlib.Path(__file__).resolve().parent;repo='MChartier/calibrate-health';checkout=r.parent/'calibrate-auth-qa'
def git(*args):return subprocess.check_output(['git',*args],cwd=checkout).decode().strip()
def blob(ref,path):return subprocess.check_output(['git','show',ref+':'+path],cwd=checkout)
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
d=json.loads((r/'initial.json').read_bytes());p=d['pr'];head=p['head']['sha'];old='0c26cea12e3ecdbc962eebaeb140af35f54ab95a';master=d['master']['sha'];mb=git('merge-base',head,master)
assert git('rev-parse','HEAD')==head=='cd8932b24b76af564d7e50f69750dba8f44c8e68';assert mb==p['base']['sha']=='4cbcbc740fbe5fa5646b4de31951c79a653176d5';assert master=='9dc0739e36168aa273530fe00ae5f85fb9c8a3fe';assert git('show','-s','--format=%P',head)==old
assert git('rev-list','--reverse',master+'..'+head).splitlines()==[x['sha'] for x in d['commits']]==[old,head]
paths=git('diff','--name-only',mb,head).splitlines();assert set(paths)=={x['filename'] for x in d['files']};assert len(paths)==p['changed_files']==30;assert sum(x['additions'] for x in d['files'])==627;assert sum(x['deletions'] for x in d['files'])==785
assert git('diff','--name-only',old,head).splitlines()==['README.md','docs/deployment.md']
prior=json.loads((r/'prior-verdict.json').read_bytes());critical=[]
for a in prior['audit']['criticalUnchanged']:
 path=a['path'];assert git('rev-parse',head+':'+path)==git('rev-parse',master+':'+path)==a['headAndActualTargetBlob'];critical.append(a)
docs=[]
for path in ['README.md','docs/deployment.md']:
 before=blob(old,path).decode();after=blob(head,path).decode()
 assert re.findall(r'```[\s\S]*?```|`[^`\n]+`',before)==re.findall(r'```[\s\S]*?```|`[^`\n]+`',after)
 links=re.findall(r'\]\(([^)]+)\)',after);assert links==re.findall(r'\]\(([^)]+)\)',before)
 for link in links:
  if '://' not in link and not link.startswith('#'):assert (checkout/pathlib.Path(path).parent/link.split('#')[0]).exists(),link
 if path=='README.md':
  section=lambda s:s.split('## Releases and deployment')[0]+s.split('## Development')[1]
  assert section(before)==section(after)
 docs.append({'path':path,'commandsAndLinksUnchanged':True,'beforeBlob':git('rev-parse',old+':'+path),'afterBlob':git('rev-parse',head+':'+path)})
receipts=[]
for id,digest,updated in [(6068012907,'9fa5c95ff7c4c03cb729ec8476e05ef4ee8b4d696b0495eb4892cc948e8fb45b','2026-10-08T20:01:39Z'),(6032519419,'3948d752a0429256c80acc91097299bed09c5afb5fa200eb599f48212695a5c1','2026-10-07T06:42:56Z')]:
 c=api('issues/comments/'+str(id));assert hashlib.sha256(c['body'].encode()).hexdigest()==digest and c['updated_at']==updated;receipts.append({'verdictCommentId':id,'verdictBodySha256':digest,'verdictUpdatedAt':updated})
owner=json.loads((r/'owner/4852cccf92047a17d72014674a1e0f5371255b3d/final-receipt.json').read_bytes());identities=json.loads((r/'identities.json').read_bytes())
for x in owner['evidence']['files']:
 actual=next(a for a in identities if a['commit']==owner['evidence']['commit'] and a['path']==x['path']);assert x['sha256']==actual['sha256']
assert hashlib.sha256((r/'owner/4852cccf92047a17d72014674a1e0f5371255b3d/final-receipt.json').read_bytes()).hexdigest()=='a4570fac4eb3478278ee470c37a10154d0b88407233027d2a1497f409566b114'
runs=[]
for run in sorted(set(re.search(r'/actions/runs/(\d+)',x['details_url']).group(1) for x in d['checks']['check_runs'])):
 a=api('actions/runs/'+run);assert a['head_sha']==head and a['conclusion']=='success';runs.append(a)
assert len(runs)==5;assert d['checks']['total_count']==len(d['checks']['check_runs']);assert all(x['status']=='completed' and x['conclusion'] in ['success','skipped'] for x in d['checks']['check_runs'])
original401=api('pulls/401');assert original401['state']=='closed' and not original401['merged']
v={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headSha':head,'baseSha':master,'apiBaseSha':p['base']['sha'],'mergeBaseSha':mb,'ultimateTargetSha':master,'headParents':git('show','-s','--format=%P',head).split(),'targetParents':git('show','-s','--format=%P',master).split(),'parentRevisions':[],'scope':{'commits':[{'sha':x['sha'],'parents':[a['sha'] for a in x['parents']]} for x in d['commits']],'paths':paths,'additions':627,'deletions':785},'documentationChecks':docs,'criticalUnchanged':critical,'historicalReceipts':receipts,'workflowRuns':runs,'checkSummary':{c:sum(x['conclusion']==c for x in d['checks']['check_runs']) for c in ['success','skipped']},'original401':{k:original401[k] for k in ['state','merged','head']},'priorTestsApplicability':'Only two documentation files changed since independently reviewed0c26cea; original runtime/workflows/tests and nine master safeguards byte-identical. Actual master remains the same as prior target-impact assessment; incoming food-day commits do not affect release contracts. Historical117 original-reviewer tests and source-bound fixtures reused, not newly executed.','workingTree':git('status','--porcelain')}
(r/'verification.json').write_bytes((json.dumps(v,indent=2)+'\n').encode());print(json.dumps({'scope':'2 commits30paths+627/-785','correction':'2 documentation files; commands/links unchanged','checks':v['checkSummary'],'historicalReceiptsVerified':len(receipts)}))
