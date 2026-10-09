import pathlib,json,hashlib,subprocess,zipfile,datetime,urllib.parse
r=pathlib.Path('review456');o=r/'owner';d=json.loads((r/'initial.json').read_bytes());h=json.loads((r/'handoff.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],cwd='calibrate-auth-qa')
m=json.loads((o/'manifest.json').read_bytes());assert sha((o/'manifest.json').read_bytes())=='7a8c2415bd6999567ea722b5cfc723e97eb6bb93a6635f84433a6934b1f02789'
for x in m['artifacts']:
 b=(o/x['path']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256'],x['path']
sc=json.loads((o/'scoping/manifest.json').read_bytes());assert sha((o/'scoping/manifest.json').read_bytes())==m['originalScopingManifestSha256']
for group in ['artifacts','sourceFiles','buildFiles']:
 for x in sc[group]:
  b=(o/('scoping' if group=='artifacts' else 'scoping/source-build')/x['path'].replace('\\','/')).read_bytes();assert sha(b)==x['sha256'],x['path']
head=d['pr']['head']['sha'];base=d['master']['sha'];assert head==h['head'] and base==h['target']['actualTarget']==d['pr']['base']['sha'];assert git('merge-base',base,head).decode().strip()==base
assert d['bodySha256']==h['bodySha256'];assert git('rev-list','--reverse',base+'..'+head).decode().split()==[x['sha'] for x in d['commits']]
assert len(d['commits'])==2 and len(d['files'])==3 and sum(x['additions'] for x in d['files'])==72 and sum(x['deletions'] for x in d['files'])==9
assert set(git('diff','--name-only',base,head).decode().split())=={x['filename'] for x in d['files']}
for c in d['commits']:assert git('show','-s','--format=%P',c['sha']).decode().split()==[p['sha'] for p in c['parents']]
assert git('diff','--numstat',m['afterSource'],head).decode().strip()=='0\t1\te2e/expo-web/food-quantity-entry.spec.ts';assert not git('diff',m['afterSource'],head,'--','mobile','packages','shared')
for p in ['AGENTS.md','e2e/expo-web/fixtures.ts','scripts/expo-web-static-server.mjs','package-lock.json']:assert git('show',base+':'+p)==git('show',head+':'+p)
builds=[];traces=[]
for phase,source in [('before',base),('after',m['afterSource'])]:
 build=json.loads((o/f'implementation/{phase}-build.json').read_bytes());assert build['source']==source
 for x in build['files']:
  p=x['path'].replace('\\','/').removeprefix('mobile/dist/');b=(o/f'implementation/{phase}-dist'/p).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256']
 builds.append({'phase':phase,'source':source,'manifestSha256':sha((o/f'implementation/{phase}-build.json').read_bytes()),'files':len(build['files'])})
 for case in ['capture-short-selected-food-sheet','capture-supported-precision-after-save-and-reload']:
  trace=o/f'implementation/matched-{phase}-results'/case/'trace.zip';scripts=[];sources=[]
  with zipfile.ZipFile(trace) as z:
   for n in z.namelist():
    if n.startswith('resources/src@'):
     raw=z.read(n);matches=[p for p in ['implementation/capture.spec.ts','implementation/fixture.ts'] if raw==(o/p).read_bytes()]
     if raw==git('show',source+':e2e/expo-web/fixtures.ts'):matches.append('source:e2e/expo-web/fixtures.ts')
     sources.append({'sha256':sha(raw),'matches':matches})
    if n.endswith('.network'):
     for line in z.read(n).splitlines():
      event=json.loads(line)['snapshot'];url=event['request']['url'];p=urllib.parse.urlparse(url).path.lstrip('/')
      if p.endswith('.js') and event['response']['status']==200:
       f=o/f'implementation/{phase}-dist'/p
       if f.exists():scripts.append({'path':p,'sha256':sha(f.read_bytes()),'status':200})
  assert scripts;assert any('implementation/capture.spec.ts' in x['matches'] for x in sources)
  traces.append({'phase':phase,'case':case,'sha256':sha(trace.read_bytes()),'executedSources':sources,'requestedCompiledScripts':scripts})
images=[]
for x in h['evidence']['images']:
 b=(o/x['path']).read_bytes();assert sha(b)==x['sha256'];images.append(x)
out={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'base':base,'apiBase':base,'mergeBase':base,'headParents':git('show','-s','--format=%P',head).decode().split(),'targetParents':git('show','-s','--format=%P',base).decode().split(),'scope':h['completePublishedScope'],'manifestSha256':sha((o/'manifest.json').read_bytes()),'verifiedArtifacts':len(m['artifacts']),'originalScoping':{k:len(sc[k]) for k in ['artifacts','sourceFiles','buildFiles']},'builds':builds,'captureTraces':traces,'images':images,'finalHeadImpact':'Only one trailing blank test line removed since captured ff05. Product source, fixture, dependency lock and server unchanged. No image relabeling.','sourceDigests':{x['filename']:sha(git('show',head+':'+x['filename'])) for x in d['files']}}
(r/'verification.json').write_bytes((json.dumps(out,indent=2)+'\n').encode());print(json.dumps({'artifacts':out['verifiedArtifacts'],'builds':builds,'images':len(images),'traceSources':traces[0]['executedSources']}))
