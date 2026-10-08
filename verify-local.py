import pathlib,json,subprocess,hashlib,collections,datetime
r=pathlib.Path('reassess452');root=pathlib.Path('calibrate-auth-qa');d=json.loads((r/'fresh.json').read_bytes());head=d['pr']['head']['sha'];parent='0c26cea12e3ecdbc962eebaeb140af35f54ab95a';target='cd8932b24b76af564d7e50f69750dba8f44c8e68'
def raw(*args):return subprocess.check_output(['git',*args],cwd=root)
def git(*args):return raw(*args).decode().strip()
assert git('rev-parse','HEAD')==head
commits=git('rev-list','--reverse',target+'..'+head).splitlines();assert commits==[x['sha'] for x in d['commits']]
paths=git('diff','--name-only',target+'...'+head).splitlines();assert set(paths)=={x['filename'] for x in d['files']};assert len(paths)==86
inventory=[]
for p in paths:
 purpose='Maintained release safety regression' if '.test.' in p else 'Maintained operator guide' if p.endswith('.md') else 'Workflow authority and receipt trust' if p.startswith('.github/') else 'Explicit build configuration / independent iOS version' if p.startswith(('mobile/','shared/')) else 'Release orchestration, provider verification and recovery'
 inventory.append({'path':p,'purpose':purpose,'sha256':hashlib.sha256(raw('show',head+':'+p)).hexdigest()})
changes=git('diff','--name-only',parent,target).splitlines();assert changes==['README.md','docs/deployment.md'];assert not set(changes)&set(paths)
last=raw('diff','a8539c3b90bd8c69a761c234869e5a0553f8ed08',head).decode();expected=json.loads((r/'owner/ced19a3b2b32f67aa5fdf1abea2b7b9342326a03/final-applicability.json').read_bytes());assert last==expected['diff']
report={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'actualTarget':target,'apiBase':d['pr']['base']['sha'],'mergeBase':git('merge-base',target,head),'ultimateTarget':d['master']['sha'],'ultimateMergeBase':git('merge-base',d['master']['sha'],head),'headParents':git('show','-s','--format=%P',head).split(),'targetParents':git('show','-s','--format=%P',target).split(),'commits':[{'sha':c,'parents':git('show','-s','--format=%P',c).split(),'subject':git('show','-s','--format=%s',c),'paths':git('diff-tree','--no-commit-id','--name-status','-r',c).splitlines()} for c in commits],'inventory':inventory,'totals':{'commits':len(commits),'files':len(paths),'additions':sum(x['additions'] for x in d['files']),'deletions':sum(x['deletions'] for x in d['files'])},'parentDelta':changes,'impact':'Actual published ordered range and paths independently match API. Parent advancement changes only two documentation files not touched by child; executable/workflow/configuration input unchanged. Existing child tests remain applicable to executable contracts; not relabeled as hosted CI on new target. Final six export removals exactly match retained owner diff and do not alter logic. No product evidence/history churn.'}
(r/'scope-verification.json').write_text(json.dumps(report,indent=2)+'\n')
exe=pathlib.Path('tools/actionlint-1.7.12/bin/actionlint.exe').resolve();runs={}
for label,rev in [('parent',parent),('head',head)]:
 folder=(r/('lint-input-'+label)).resolve();folder.mkdir(exist_ok=True);names=[]
 for p in paths:
  if not p.startswith('.github/workflows/'):continue
  x=subprocess.run(['git','show',rev+':'+p],cwd=root,capture_output=True)
  if x.returncode:continue
  dest=folder/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(x.stdout);names.append(p)
 x=subprocess.run([str(exe),'-shellcheck=','-pyflakes=','-format','{{json .}}',*names],cwd=folder,capture_output=True);(r/('actionlint-'+label+'.json')).write_bytes(x.stdout);rows=json.loads(x.stdout);runs[label]={'exit':x.returncode,'diagnostics':rows}
def sig(x):return json.dumps([x['filepath'].replace('\\','/'),x['kind'],x['message'],x['snippet'].split('\n')[0].strip()])
b=collections.Counter(map(sig,runs['parent']['diagnostics']));a=collections.Counter(map(sig,runs['head']['diagnostics']));added=[{'diagnostic':json.loads(k),'count':v} for k,v in (a-b).items()]
assert len(runs['parent']['diagnostics'])==61 and len(runs['head']['diagnostics'])==68 and sum(x['count'] for x in added)==7
(r/'lint-verification.json').write_text(json.dumps({'tool':'actionlint 1.7.12','source':head,'parent':parent,'parentExit':runs['parent']['exit'],'headExit':runs['head']['exit'],'parentDiagnostics':61,'headDiagnostics':68,'added':added,'assessment':'Four queue:max and three job.workflow_sha diagnostics. All use valid GitHub Cloud features at allowed locations; no queue:max combines cancel-in-progress:true. Raw lint fails; no clean-lint claim, no broad suppression. Official docs checked 2026-10-08/09 UTC.','sources':['https://docs.github.com/en/actions/reference/workflows-and-actions/contexts','https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency']},indent=2)+'\n')
print(json.dumps({'scope':report['totals'],'parentDelta':changes,'lintAdded':added}))
