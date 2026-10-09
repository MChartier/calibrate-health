const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve('focused-438-01a11c7b');
const old = path.resolve('managed-clone-438-01a11c7b');
for (const d of ['node_modules','mobile/node_modules']) {
  if (!fs.existsSync(path.join(target,d))) fs.symlinkSync(path.join(old,d),path.join(target,d),'junction');
}
for (const name of ['AuthContext.tsx','AuthContext.web.tsx']) {
 const p=path.join(target,'mobile/src/auth',name);
 let s=fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
 s=s.replace(/^    (?:setServerUrl|testServerUrl):.*\n/gm,'').replaceAll(', serverCandidate: string','').replaceAll(', _serverCandidate: string','').replace(/            serverCandidate: string,\n/,'').replace(/        _serverCandidate: string,\n/,'');
 s=s.replace(/^            setServerUrl: updateServerUrl,\n/m,'').replace(/^            testServerUrl,\n/m,'').replace(/^        setServerUrl: async.*\n/m,'').replace(/^        testServerUrl: async.*\n/m,'');
 if(name==='AuthContext.tsx') {
  s=s.replace(', confirmServerSwitch','').replace('    writeServerUrl,\n','');
  const start=s.indexOf('    const testServerUrl =');
  const end=s.indexOf('    const updateCurrentUser =',start);
  if(start<0||end<0) throw Error('Native removal anchors absent');
  s=s.slice(0,start)+`    const confirmCurrentServer = useCallback(async (): Promise<ServerConnectionResult> => {
        const result = await probeServerUrl(serverUrlRef.current);
        setAuthError(result.ok ? null : result.message);
        return result;
    }, [probeServerUrl]);

`+s.slice(end);
  s=s.replaceAll('candidate: serverCandidate','candidate: serverUrlRef.current').replaceAll('confirmSelectedServerUrl','confirmCurrentServer').replace(', testServerUrl, updateCurrentUser, updateServerUrl,',', updateCurrentUser,');
 }
 fs.writeFileSync(p,s);
}
// Preserve known regression scenarios; the focused run selects only the relevant race cases.
for (const n of ['AuthContext.test.tsx','AuthContext.web.test.tsx']) fs.copyFileSync(path.join(old,'mobile/src/auth',n),path.join(target,'mobile/src/auth',n));
