const fs=require('fs'), cp=require('child_process'), assert=require('assert/strict'), path=require('path'), crypto=require('crypto');
const cwd=path.join(__dirname,'correction');
const git=(...a)=>cp.execFileSync('git',a,{cwd,encoding:'utf8'}).trim();
const original='0c26cea12e3ecdbc962eebaeb140af35f54ab95a';
const files=['README.md','docs/deployment.md'];
assert.deepEqual(git('diff','--name-only',original).split('\n'),files);
let links=0;
for(const f of files){
 const before=cp.execFileSync('git',['show',`${original}:${f}`],{cwd,encoding:'utf8'}).replace(/\r\n/g,'\n');
 const after=fs.readFileSync(path.join(cwd,f),'utf8').replace(/\r\n/g,'\n');
 const tokens=s=>[...s.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map(m=>m[0]);
 assert.deepEqual(tokens(after),tokens(before),f+' command/code tokens preserved');
 const targets=s=>[...s.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]);
 assert.deepEqual(targets(after),targets(before),f+' link targets preserved');
 for(const dest of targets(after)){if(/^https?:/.test(dest))continue;assert(fs.existsSync(path.resolve(cwd,path.dirname(f),dest.split('#')[0])),dest);links++;}
 if(f==='README.md'){
  const section=s=>s.split('## Releases and deployment\n')[1].split('## Development\n')[0];
  assert.equal(before.replace(section(before),''),after.replace(section(after),''));
  assert(!section(after).includes('Advanced self-hosting'));
 } else {
  assert(!after.includes('your host')); assert(!after.includes('Compose self-hosting'));
  assert.equal(after.split('## Local Android phone + Wear')[1].split('## Maintainer references')[0],before.split('## Local Android phone + Wear')[1].split('## Maintainer references')[0]);
 }
}
git('diff','--check',original);
const pr=JSON.parse(fs.readFileSync('records/pulls-441.json','utf8').replace(/^\uFEFF/,''))[0];
fs.writeFileSync('records/pr-body-before.md',pr.body);
const result={checkedAtUtc:new Date().toISOString(),host:process.env.COMPUTERNAME,original,files,localLinksVerified:links,checks:['two-file boundary','README changes limited to Releases and deployment','all inline code and commands unchanged','all Markdown link targets unchanged','local link paths exist','native and OTA instructions unchanged','git diff --check'],beforeBodySha256:crypto.createHash('sha256').update(pr.body).digest('hex')};
fs.writeFileSync('records/doc-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
