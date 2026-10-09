import json,pathlib,subprocess,hashlib
r=pathlib.Path('recheck452');c='b46c78334ecc58c31cdd83602d172a0d2c1f05cc';p=r/'owner'/c
assert hashlib.sha256((p/'qa-final-receipt.json').read_bytes()).hexdigest()=='a3fc8e429dc29c3117e61b57bccd4cf3367e66fbcd25a8c2dfa32d57eacfef07'
m=json.loads((p/'qa-corrections-manifest.json').read_bytes());assert hashlib.sha256((p/'qa-corrections-manifest.json').read_bytes()).hexdigest()=='ecf23a125c80483e0a1d9f48a3b8bc8bc8899d146500873775a121ce099bdd09'
for f in m['files']:assert hashlib.sha256((p/f['path']).read_bytes()).hexdigest()==f['sha256']
def api(x):return json.loads(subprocess.check_output(['gh','api','repos/MChartier/calibrate-health/'+x]))
t=api('git/trees/517fd4b8f69a67e6e7e50f251b656849efe05556?recursive=1');assert not t['truncated'];ids={x['path']:x for x in json.loads((r/'identities.json').read_bytes())}
for f in m['files']+[{'path':'qa-corrections-manifest.json'}]:
 x=next(x for x in t['tree'] if x['path']==f['path']);assert x['sha']==ids[f['path']]['gitBlobSha']
parent={'issue':api('issues/440'),'pr':api('pulls/441')};(r/'parent-current.json').write_text(json.dumps(parent,indent=2)+'\n')
(r/'owner-evidence-verification.json').write_text(json.dumps({'receiptCommit':c,'receiptPath':'qa-final-receipt.json','receiptSha256':hashlib.sha256((p/'qa-final-receipt.json').read_bytes()).hexdigest(),'linkedProvenanceCommit':'517fd4b8f69a67e6e7e50f251b656849efe05556','manifestSha256':hashlib.sha256((p/'qa-corrections-manifest.json').read_bytes()).hexdigest(),'allManifestArtifactsVerified':len(m['files']),'linkedTreeBlobIdentitiesMatched':True,'priorVerdictCommentId':6071350064,'priorVerdictBodySha256':'9e6210f08edf66852e8c98be34add10dc57b810cbeb31fc6da13b84850f93717','priorEvidenceCommit':'b3ce696a170bd657e4e9f7715d7fc45f93b96c67','priorReceiptUnchanged':True},indent=2)+'\n')
print(parent['issue']['body'])
