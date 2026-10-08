import pathlib,json,hashlib,subprocess,datetime,socket
root=pathlib.Path('reassess450'); repo='MChartier/calibrate-health'
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+p]))
def pages(p):
 out=[];page=1
 while True:
  rows=api(p+('&' if '?' in p else '?')+f'per_page=100&page={page}');out.extend(rows)
  if len(rows)<100:return out
  page+=1
def sha(b):return hashlib.sha256(b).hexdigest()
verified=[]
for m in (root/'owner').rglob('artifact-digests.json'):
 for x in json.loads(m.read_bytes()):
  p=m.parent/x['path'];b=p.read_bytes();assert sha(b)==x['sha256'],str(p)
  if 'bytes' in x:assert len(b)==x['bytes']
  verified.append({'manifest':str(m.relative_to(root)),**x})
d={'host':socket.gethostname(),'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pr':api('pulls/450'),'master':api('commits/master'),'issue':api('issues/438'),'comments':pages('issues/450/comments'),'issuecomments':pages('issues/438/comments'),'reviews':pages('pulls/450/reviews'),'inline':pages('pulls/450/comments'),'commits':pages('pulls/450/commits'),'files':pages('pulls/450/files'),'checks':api('commits/60eca5e0add3cf612041f8a5ad5400fbd33b7abe/check-runs?per_page=100')}
d['prBodySha256']=sha(d['pr']['body'].encode('utf-8'))
old=json.loads((root/'initial.json').read_bytes())
print('Changed feedback:',[k for k in ['comments','issuecomments','reviews','inline'] if old[k]!=d[k]])
for k in ['comments','issuecomments','reviews','inline']:
 prior={x['id']:x for x in old[k]}
 for x in d[k]:
  if x!=prior.get(x['id']):print(k,x['id'],x.get('body'))
git=lambda *args:subprocess.check_output(['git','-C','calibrate-auth-qa',*args]).decode().strip()
base=d['master']['sha'];head=d['pr']['head']['sha'];assert git('rev-parse','HEAD')==head
ordered=git('rev-list','--reverse',base+'..'+head).splitlines();assert ordered==[c['sha'] for c in d['commits']]
localpaths=git('diff','--name-only',base,head).splitlines();assert set(localpaths)=={x['filename'] for x in d['files']}
scope=[]
for c in d['commits']:
 parents=git('show','-s','--format=%P',c['sha']).split();assert parents==[p['sha'] for p in c['parents']]
 scope.append({'sha':c['sha'],'parents':parents,'subject':c['commit']['message'],'numstat':git('diff-tree','--no-commit-id','--numstat','-r',c['sha'])})
record={'checkedAtUtc':d['checkedAtUtc'],'verifiedManifestEntries':verified,'orderedCommits':scope,'mergeBase':git('merge-base',base,head),'status':git('status','--porcelain'),'paths':d['files']}
(root/'final.json').write_bytes((json.dumps(d,indent=2)+'\n').encode());(root/'verification.json').write_bytes((json.dumps(record,indent=2)+'\n').encode())
print('host',d['host'],'head',head,'target',base,'body',d['prBodySha256'],'commits',len(scope),'paths',len(localpaths),'manifest entries',len(verified),'checkcount',d['checks']['total_count']);print('scope',json.dumps(scope))
