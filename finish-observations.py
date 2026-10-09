import pathlib,json,hashlib,zipfile
r=pathlib.Path('review456');v=json.loads((r/'verification.json').read_bytes());obs=json.loads((r/'browser-observations.json').read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
offline=next(x for x in obs if 'offline-add' in x['path']);lost=next(x for x in obs if 'committed-add' in x['path'])
assert len(offline['queued'])==len(offline['rows'])==2
for q in offline['queued']:
 matches=[t for t in offline['traffic'] if t['key']==q['id']];assert matches and any(t['status'] in [200,201] for t in matches)
 assert len({json.dumps(t['payload'],sort_keys=True) for t in matches})==1
assert len(lost['rows'])==2 and len({t['key'] for t in lost['traffic']})==1 and len({json.dumps(t['payload'],sort_keys=True) for t in lost['traffic']})==1
assert lost['traffic'][0]['committed'] and lost['traffic'][-1]['status']==201
reports={p:json.loads((r/(p+'-report.json')).read_bytes())['stats'] for p in ['before','after','controls']};assert reports['before']['unexpected']==3 and reports['after']['expected']==3 and reports['controls']['expected']==18
v['independentBrowser']={'reports':reports,'setup':'Node24.19.0, Chrome155.0.8059.39 on MCHARTIER_ZBOOK. Single worker; exact retained before/after exports at127.0.0.1:18456. Same maintained fixtures and tests; only filesystem import paths changed. Full raw trace/results retained in qa-browser-evidence.zip. Synthetic API; native device and live database not executed.','offlineQueuedOperationIds':[q['id'] for q in offline['queued']],'lostAcknowledgementOperationId':lost['traffic'][0]['key'],'lostAcknowledgementRowCount':len(lost['rows']),'queuedPayloadsAndRetryIdentitiesVerified':True,'controlObservations':'browser-observations.json'}
v['pixelObservations']={'short-sheet':'Both390x420, same selected quarter-cup oats and0.125 input scenario. Baseline fixed controls fill screen with Amount hidden below; after genuine scroller exposes Amount0.125, step buttons,13kcal and0.031cups. Add button reachability independently proved by scrolling and actualPOST; not claimed visible in this single image.','precise-edit':'Both390x844 with same synthetic log, focus/selection, light theme and frozen date. Baseline reopening shows0.25; after shows0.250001 and corresponding log subtitle. Layout otherwise matches. No manipulated quantity pixels.','normalization':'Both use maintained hideTransientPwaNotices helper for unrelated lifecycle notices; screenshot originals untransformed. Same synthetic data, frozen clock, deterministic IDs, viewport, scale1, locale/timezone and reduced motion; fonts+3frames settled.','renderedGitHub':'Waived by direct amendment6022754087; not claimed executed. All four exact committed PNGs opened and inspected independently.'}
(r/'verification.json').write_bytes((json.dumps(v,indent=2)+'\n').encode())
names=[]
for folder in ['qa','before-results','after-results','controls-results']:
 for p in sorted((r/folder).rglob('*')):
  if p.is_file():names.append(p)
with zipfile.ZipFile(r/'qa-browser-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in names:z.writestr(p.relative_to(r).as_posix(),p.read_bytes())
(r/'qa-browser-manifest.json').write_bytes((json.dumps({'zipSha256':sha((r/'qa-browser-evidence.zip').read_bytes()),'files':[{'path':p.relative_to(r).as_posix(),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in names]},indent=2)+'\n').encode())
print(json.dumps({'reports':reports,'bundleBytes':(r/'qa-browser-evidence.zip').stat().st_size,'files':len(names)}))
