import json,pathlib,subprocess,hashlib,base64,re,datetime
r=pathlib.Path(__file__).resolve().parent;repo='MChartier/calibrate-health';prior=r.parent/'current452'
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
def pages(p):
 out=[];page=1
 while True:
  x=api(p+f'?per_page=100&page={page}');out+=x
  if len(x)<100:return out
  page+=1
def save(n,v):(r/n).write_bytes((json.dumps(v,indent=2)+'\n').encode())
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
d=json.loads((r/'initial.json').read_bytes());old=json.loads((prior/'prepublish.json').read_bytes());v=json.loads((prior/'verdict.json').read_bytes())
assert d['pr']['head']['sha']==v['headSha'] and d['pr']['base']['sha']==v['apiBaseSha'] and d['master']['sha']==v['ultimateTargetSha'];assert api('commits/'+v['targetRef'])['sha']==v['baseSha'];assert d['pr']['body']==old['pr']['body']
for k in ['commits','files']:assert d[k]==old[k]
before='This association is nonclosing and covers preparation only; no release or provider execution is implied.'
after='This PR closes the bounded source-preparation issue upon merge; it does not complete deployment, release, provider validation or device rollout.'
assert old['issue']['body'].count(before)==1;assert d['issue']['body']==old['issue']['body'].replace(before,after);assert sha(d['issue']['body'])=='6b41742aed20caa9febfa47a4b60e4a46c12060bba06e82389e3241e276913a1'
archive=next(x for x in d['issueComments'] if x['id']==6074679404);assert sha(archive['body'])=='db8ae6402098bb3a0f439898275d6108b8d662f614da8ce9bb35f625e906e99a';assert archive['body'].endswith(old['issue']['body']);save('preservation-comment.json',archive)
receipts=[]
for folder in ['reassess452','recheck452','current452','current441']:
 x=json.loads((r.parent/folder/'trusted-receipt.json').read_bytes());current=api('issues/comments/'+str(x['verdictCommentId']));assert sha(current['body'])==x['verdictBodySha256'] and current['updated_at']==x['verdictUpdatedAt'];receipts.append(x)
parent={'pr':api('pulls/441'),'issue':api('issues/440'),'comments':pages('issues/441/comments'),'issueComments':pages('issues/440/comments'),'reviews':pages('pulls/441/reviews'),'inline':pages('pulls/441/comments')};save('parent-current.json',parent)
assert parent['pr']['head']['sha']==v['baseSha'] and sha(parent['pr']['body'])==v['parentPrBodySha256'] and sha(parent['issue']['body'])==v['parentIssueBodySha256'];assert not parent['pr']['merged'] and not parent['pr']['draft'] and 'human-ready' in [x['name'] for x in parent['pr']['labels']]
q='{repository(owner:"MChartier",name:"calibrate-health"){issue(number:447){projectItems(first:100){nodes{id project{number title}fieldValues(first:100){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}pageInfo{hasNextPage}}}pageInfo{hasNextPage}}}pullRequest(number:452){projectItems(first:100){nodes{id project{number title}}pageInfo{hasNextPage}}}}}'
project=json.loads(subprocess.check_output(['gh','api','graphql','-f','query='+q]));assert not project.get('errors');save('project-readback.json',project)
native=json.loads((r/'native.json').read_bytes())['data']['repository']['pullRequest'];assert native['closingIssuesReferences']=={'nodes':[{'number':447}],'pageInfo':{'hasNextPage':False}};assert native['reviewThreads']['totalCount']==0
runs=[]
for n in sorted(set(re.search(r'/actions/runs/(\d+)',x['details_url']).group(1) for x in d['checks']['check_runs'])):
 x=api('actions/runs/'+n);assert x['head_sha']==v['headSha'] and x['conclusion']=='success';runs.append(x)
assert len(runs)==5 and len(d['checks']['check_runs'])==d['checks']['total_count']==25
ids=[]
for commit,digest in [('58ce652d87f2800c6c8d4418d5570d33e1b3ca42','92d53466a1c9b78a550933c8843c9188e478fb99663b3226e423f60408e8c05d'),('49c1a587729372182e6629e0b4e5ca10548bb306','35396992852afc5ae42145527dbacbc5113ca06ef1a5962d585b01bf3eb86f58')]:
 tree=api('git/trees/'+commit);x=next(z for z in tree['tree'] if z['path']=='verdict.json');z=api('git/blobs/'+x['sha']);raw=base64.b64decode(z['content']);assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==x['sha'];assert hashlib.sha256(raw).hexdigest()==digest;ids.append({'commitSha':commit,'path':'verdict.json','sha256':digest,'gitBlobSha':x['sha'],'bytes':len(raw)})
save('verification.json',{'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'oneSentenceOnly':True,'before':before,'after':after,'oldIssueSha256':sha(old['issue']['body']),'newIssueSha256':sha(d['issue']['body']),'preservationCommentId':archive['id'],'preservationCommentSha256':sha(archive['body']),'nativeClosingIssue':447,'headBodyTargetScopeUnchanged':True,'historicalReceipts':receipts,'verifiedArtifacts':ids,'workflowRuns':runs,'checkSummary':{s:sum(x['conclusion']==s for x in d['checks']['check_runs']) for s in ['success','skipped']}})
print(json.dumps({'C3':'one-sentence correction; exact old body retained','nativeClosingIssue':447,'historicalReceipts':len(receipts),'project':project}))
