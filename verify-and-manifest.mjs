import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const original='86d752cfe7fc524a15a61eb58189566849f872d4befd44df40a557ffb484ac76';
if(hash('scoping/manifest.json')!==original)throw Error('Original manifest changed');
const prior=JSON.parse(fs.readFileSync('scoping/manifest.json','utf8'));
for(const group of ['artifacts','sourceFiles','buildFiles'])for(const file of prior[group]){
 const p=path.join(group==='artifacts'?'scoping':'scoping/source-build',file.path);
 if(hash(p)!==file.sha256)throw Error(`Original byte mismatch: ${p}`);
}
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
const artifacts=files('.').filter(p=>p!=='manifest.json').sort().map(p=>({path:p.replaceAll('\\','/'),sha256:hash(p),bytes:fs.statSync(p).size}));
fs.writeFileSync('manifest.json',JSON.stringify({createdAt:new Date().toISOString(),beforeSource:'547206a1b372b73fc95fc412ad453b8099440000',afterSource:'ff05e56ed338ec2c178dc05cdf77125d34395c67',originalScopingManifestSha256:original,verifiedOriginalArtifacts:prior.artifacts.length,verifiedOriginalSourceFiles:prior.sourceFiles.length,verifiedOriginalBuildFiles:prior.buildFiles.length,artifacts},null,2)+'\n');
console.log(JSON.stringify({manifestSha256:hash('manifest.json'),artifacts:artifacts.length,originalVerified:true}));
