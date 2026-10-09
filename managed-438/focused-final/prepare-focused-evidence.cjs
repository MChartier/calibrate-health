const fs=require('node:fs'),p=require('node:path');
const dir=p.resolve('focused-evidence-438');fs.mkdirSync(dir,{recursive:true});
for(const f of ['matched.spec.ts','capture.config.cjs'])fs.copyFileSync(p.join('evidence-438-01a11c7b',f),p.join(dir,f));
const before=p.resolve('focused-before-438-01a11c7b');
let spec=fs.readFileSync('managed-clone-438-01a11c7b/mobile/src/auth/AuthContext.test.tsx','utf8');
spec=spec.replace("import { AuthProvider, useAuth } from './AuthContext';",`import { AuthProvider, useAuth as useBaselineAuth } from './AuthContext';
function useAuth() {
 const auth = useBaselineAuth();
 return { ...auth, login: (email: string, password: string) => auth.login(email,password,'https://health.example'),
 register: (email: string, password: string, acceptance: any) => auth.register(email,password,'https://health.example',acceptance) };
}`);
spec=spec.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(_,q,s)=>q+p.resolve(before,'mobile/src/auth',s).replaceAll('\\','/')+q);
fs.writeFileSync(p.join(dir,'untouched-master-native.test.tsx'),spec);
const config=JSON.parse(fs.readFileSync(p.join(before,'mobile/package.json'))).jest;
config.rootDir=p.join(before,'mobile');config.roots=[config.rootDir,dir];config.testMatch=[p.join(dir,'untouched-master-native.test.tsx').replaceAll('\\','/')];
config.modulePaths=[p.join(before,'node_modules'),p.join(before,'mobile/node_modules')];
fs.writeFileSync(p.join(dir,'baseline-jest.json'),JSON.stringify(config,null,2));
