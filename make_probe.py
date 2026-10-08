import pathlib,re,json
p=pathlib.Path('reassess450').resolve();repo=pathlib.Path('calibrate-auth-qa').resolve();auth=repo/'mobile/src/auth';s=(auth/'AuthContext.test.tsx').read_text();s=s[:s.index("describe('AuthProvider")]+s[s.index('const AUTH_PAYLOAD'):s.index("describe('native onboarding")]
s=re.sub(r"(['\"])(\.{1,2}/[^'\"]+)\1",lambda m:json.dumps(str((auth/m[2]).resolve()).replace('\\','/')),s)
s+='''
it('QA late native login after provider remount cannot overwrite replacement credentials', async () => {
 mockGetClientConfig.mockResolvedValue({server_version:'1.2.0'});mockRefreshMobile.mockResolvedValue(AUTH_PAYLOAD);
 jest.mocked(testCalibrateServerConnection).mockResolvedValue({ok:true,url:'https://health.example',config:{} as never,message:'Connected'});
 const first=renderAuth();await waitFor(()=>expect(first.result.current.user?.id).toBe(7));
 let finish!: (v:typeof AUTH_PAYLOAD)=>void;mockLoginMobile.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 let pending!:Promise<boolean>;act(()=>{pending=first.result.current.login('old@example.invalid','synthetic')});await waitFor(()=>expect(finish).toBeDefined());
 first.unmount();const second=renderAuth();await waitFor(()=>expect(second.result.current.isLoading).toBe(false));
 mockLoginMobile.mockResolvedValueOnce({...AUTH_PAYLOAD,user:{id:8,email:'new@example.invalid'},access_token:'replacement-access',refresh_token:'replacement-refresh'});
 await act(async()=>{await second.result.current.login('new@example.invalid','synthetic')});expect(second.result.current.user?.id).toBe(8);
 await act(async()=>{finish({...AUTH_PAYLOAD,access_token:'late-old-access',refresh_token:'late-old-refresh'});await pending});
 expect(mockWriteStoredTokens).toHaveBeenLastCalledWith({accessToken:'replacement-access',refreshToken:'replacement-refresh'});
});
'''
(p/'native-remount.test.tsx').write_text(s)
owner=pathlib.Path('C:/Users/MChar/Documents/Codex/2026-10-08/task-6/managed-clone-438-01a11c7b');config=json.loads((repo/'mobile/package.json').read_text())['jest'];config.update(rootDir=str(repo/'mobile'),roots=[str(repo/'mobile'),str(p)],cacheDirectory=str(p/'jest-cache'),transform={'^.+\\.[jt]sx?$':['babel-jest',{'configFile':str(repo/'mobile/babel.config.js')}]});(p/'jest.config.json').write_text(json.dumps(config))
