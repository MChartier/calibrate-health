import json,pathlib,subprocess,hashlib,base64,re,datetime
r=pathlib.Path(__file__).resolve().parent;c=r.parent/'calibrate-auth-qa';repo='MChartier/calibrate-health'
def git(*a):return subprocess.check_output(['git',*a],cwd=c).decode().strip()
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
def pages(p):
 out=[];page=1
 while True:
  x=api(p+f'?per_page=100&page={page}');out+=x
  if len(x)<100:return out
  page+=1
def save(n,v):(r/n).write_bytes((json.dumps(v,indent=2)+'\n').encode())
d=json.loads((r/'initial.json').read_bytes());h=d['pr']['head']['sha'];t=api('commits/'+d['pr']['base']['ref'])['sha'];m=d['master']['sha'];b=git('merge-base',h,t)
assert (h,t,m,b)==('50f4a84558d9f0750ef2c6a39e82f1652e779024','cd8932b24b76af564d7e50f69750dba8f44c8e68','547206a1b372b73fc95fc412ad453b8099440000','0c26cea12e3ecdbc962eebaeb140af35f54ab95a')
prior=json.loads((r.parent/'recheck452/scope-verification.json').read_bytes());commits=git('rev-list','--reverse',t+'..'+h).splitlines();assert commits==[x['sha'] for x in d['commits']]==[x['sha'] for x in prior['commits']]
paths=git('diff','--name-only',b,h).splitlines();assert set(paths)=={x['filename'] for x in d['files']}=={x['path'] for x in prior['inventory']};assert len(paths)==86
for x in prior['inventory']:assert hashlib.sha256(subprocess.check_output(['git','show',h+':'+x['path']],cwd=c)).hexdigest()==x['sha256']
assert sum(x['additions'] for x in d['files'])==6330 and sum(x['deletions'] for x in d['files'])==110
parentDelta=git('diff','--name-only',b,t).splitlines();assert parentDelta==['README.md','docs/deployment.md'] and not set(parentDelta)&set(paths)
incoming=git('diff','--name-only','9dc0739e36168aa273530fe00ae5f85fb9c8a3fe',m).splitlines();assert len(incoming)==29 and not set(incoming)&set(paths)
direct=git('merge-tree','--write-tree',t,h);ultimate=git('merge-tree','--write-tree',m,h)
for p in paths:assert git('ls-tree',h,'--',p)==git('ls-tree',direct,'--',p)==git('ls-tree',ultimate,'--',p)
for p in incoming:assert git('ls-tree',m,'--',p)==git('ls-tree',ultimate,'--',p)
for p in parentDelta:assert git('ls-tree',t,'--',p)==git('ls-tree',direct,'--',p)
assert subprocess.check_output(['git','diff','--binary',t,direct],cwd=c)==subprocess.check_output(['git','diff','--binary',b,h],cwd=c)
refs=[]
for folder in ['reassess452','recheck452','current441']:
 receipt=json.loads((r.parent/folder/'trusted-receipt.json').read_bytes());x=api('issues/comments/'+str(receipt['verdictCommentId']));assert hashlib.sha256(x['body'].encode()).hexdigest()==receipt['verdictBodySha256'] and x['updated_at']==receipt['verdictUpdatedAt'];refs.append(receipt)
parent={'pr':api('pulls/441'),'issue':api('issues/440'),'comments':pages('issues/441/comments'),'issueComments':pages('issues/440/comments'),'reviews':pages('pulls/441/reviews'),'inline':pages('pulls/441/comments')};save('parent-current.json',parent)
assert parent['pr']['head']['sha']==t and not parent['pr']['merged'] and parent['pr']['state']=='open';assert hashlib.sha256(parent['pr']['body'].encode()).hexdigest()==refs[-1]['prBodySha256'];assert 'human-ready' in [x['name'] for x in parent['pr']['labels']] and not parent['pr']['draft']
q='{repository(owner:"MChartier",name:"calibrate-health"){issue(number:447){projectItems(first:100){nodes{id project{number title}fieldValues(first:100){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}pageInfo{hasNextPage}}}pageInfo{hasNextPage}}}pullRequest(number:452){projectItems(first:100){nodes{id project{number title}}pageInfo{hasNextPage}}}}}'
project=json.loads(subprocess.check_output(['gh','api','graphql','-f','query='+q]));assert not project.get('errors');save('project-readback.json',project)
ids=[]
specs=[('d7d8e07195c625bf7e0fbad046b1c9372dec5b5b','ultimate-refresh-impact.json'),('d7d8e07195c625bf7e0fbad046b1c9372dec5b5b','ultimate-refresh-original-body.txt'),('bd7d5b9e7a8ada1e7760c4634439065e357fb5a7','ultimate-refresh-receipt.json'),('23ba6e2ae1eba0289a0e61b734ed6889b5ae2cac','verdict.json'),('49c1a587729372182e6629e0b4e5ca10548bb306','verdict.json')]
for sha,path in specs:
 tr=api('git/trees/'+sha+'?recursive=1');assert not tr['truncated'];x=next(a for a in tr['tree'] if a['path']==path);z=api('git/blobs/'+x['sha']);data=base64.b64decode(z['content']);assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==x['sha'];dest=r/'owner'/sha/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);ids.append({'commitSha':sha,'path':path,'gitBlobSha':x['sha'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert ids[0]['sha256']=='bdc7e041ab9c6df88e8b21e99c56db20d32b9cd743ce3cb46d4597b071221c09';assert ids[2]['sha256']=='25ba76b8328e89147e2d705476fbadc32eb11b44bce01da9ba41ec15ce98bc4d';assert ids[3]['sha256']=='480d94cf903d76d4a98f0441d46094585b7f23375fbebf253da9a1e9be01f489';assert ids[4]['sha256']=='35396992852afc5ae42145527dbacbc5113ca06ef1a5962d585b01bf3eb86f58';save('identities.json',ids)
runs=[]
for n in sorted(set(re.search(r'/actions/runs/(\d+)',x['details_url']).group(1) for x in d['checks']['check_runs'])):
 x=api('actions/runs/'+n);assert x['head_sha']==h and x['conclusion']=='success';runs.append(x)
assert len(runs)==5 and len(d['checks']['check_runs'])==d['checks']['total_count']==25
save('verification.json',{'headSha':h,'baseSha':t,'apiBaseSha':d['pr']['base']['sha'],'mergeBaseSha':b,'ultimateTargetSha':m,'ultimateMergeBaseSha':git('merge-base',h,m),'headParents':git('show','-s','--format=%P',h).split(),'targetParents':git('show','-s','--format=%P',t).split(),'ultimateTargetParents':git('show','-s','--format=%P',m).split(),'scope':prior,'incoming29Paths':incoming,'parentDelta':parentDelta,'probe':{'directTree':direct,'ultimateTree':ultimate,'preservesAllPublishedAndIncomingBlobs':True,'byteIdenticalChildPatch':True,'runtimeExecution':False},'historicalReceipts':refs,'workflowRuns':runs,'checkSummary':{c:sum(x['conclusion']==c for x in d['checks']['check_runs']) for c in ['success','skipped']},'workingTree':git('status','--porcelain')})
print(json.dumps({'scope':[len(commits),len(paths),6330,-110],'parentReady':True,'retainedBlobs':len(ids),'project':project}))
