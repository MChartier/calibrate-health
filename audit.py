import pathlib,json,subprocess,hashlib,re
r=pathlib.Path('review458');c=pathlib.Path('calibrate-auth-qa');repo='MChartier/calibrate-health'
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
def git(*a):return subprocess.check_output(['git',*a],cwd=c).decode().strip()
def save(n,x):(r/n).write_bytes((json.dumps(x,indent=2)+'\n').encode())
d=json.loads((r/'initial.json').read_bytes());h=d['pr']['head']['sha'];t=d['master']['sha'];b=git('merge-base',h,t)
assert h=='0c9c839ee71bc2c3e4599b5b2580ff8ffda3f7e5' and b==t=='547206a1b372b73fc95fc412ad453b8099440000'
assert git('rev-list','--reverse',t+'..'+h).splitlines()==[x['sha'] for x in d['commits']]==[h]
assert set(git('diff','--name-only',t,h).splitlines())=={x['filename'] for x in d['files']};assert len(d['files'])==12
for x in json.loads((r/'owner/manifest.json').read_bytes())['files']:assert hashlib.sha256((r/'owner'/x['path']).read_bytes()).hexdigest()==x['sha256']
runs=[];jobs=[]
for n in sorted(set(re.search(r'/actions/runs/(\d+)',x['details_url']).group(1) for x in d['checks']['check_runs'])):
 run=api('actions/runs/'+n);assert run['head_sha']==h and run['conclusion']=='success';runs.append(run)
 j=api('actions/runs/'+n+'/jobs?per_page=100');assert j['total_count']==len(j['jobs']);jobs+=j['jobs']
assert len(runs)==5 and len(jobs)==24
q='{repository(owner:"MChartier",name:"calibrate-health"){issue(number:457){projectItems(first:100){nodes{id project{number title} fieldValues(first:100){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}pageInfo{hasNextPage}}}pageInfo{hasNextPage}}}pullRequest(number:458){projectItems(first:100){nodes{id project{number title}}pageInfo{hasNextPage}}}}}'
p=json.loads(subprocess.check_output(['gh','api','graphql','-f','query='+q]));assert not p.get('errors');save('project.json',p)
quota=api('issues/comments/6070781981');assert hashlib.sha256(quota['body'].encode()).hexdigest()=='e39b189a2ed6388c9d919876a2893ca0216a023301e11d788df190b4366991b9';save('quota.json',quota)
for n in ['113674619187','113674619130']:
 raw=subprocess.check_output(['gh','api','repos/'+repo+'/actions/jobs/'+n+'/logs']);(r/('job-'+n+'.log')).write_bytes(raw)
v=dict(headSha=h,baseSha=t,apiBaseSha=d['pr']['base']['sha'],mergeBaseSha=b,ultimateTargetSha=t,headParents=git('show','-s','--format=%P',h).split(),targetParents=git('show','-s','--format=%P',t).split(),parentRevisions=[],scope={'commits':d['commits'],'files':d['files'],'additions':sum(x['additions'] for x in d['files']),'deletions':sum(x['deletions'] for x in d['files'])},workflowRuns=runs,jobs=jobs,checkSummary={k:sum(x['conclusion']==k for x in jobs) for k in ['success','skipped']},workingTree=git('status','--porcelain'))
save('verification.json',v);print(json.dumps({'checks':v['checkSummary'],'project':p}))
