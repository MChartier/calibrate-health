import subprocess,pathlib,os,json,datetime
r=pathlib.Path(__file__).resolve().parent
bin=pathlib.Path(r'C:\Users\MChar\Documents\Codex\2026-10-08\task-13\pg-test-runtime\node_modules\@embedded-postgres\windows-x64\native\bin')
data=r/'pgdata'; backend=r.parent/'calibrate-auth-qa'/'backend'; env=os.environ.copy()
url='postgresql://postgres@127.0.0.1:55453/calibrate_test_qa453'
env['DATABASE_URL']=url;env['CALIBRATE_AUTH_TEST_DATABASE_URL']=url
env['AUTH_PROVIDER']='local'
commands=[]
def run(args,log,cwd=r):
 with (r/log).open('wb') as f:
  p=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
 commands.append({'command':[str(x) for x in args],'cwd':str(cwd),'log':log,'exitCode':p.returncode})
 if p.returncode:raise RuntimeError(log+' failed')
try:
 if not data.exists():run([bin/'initdb.exe','-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],'initdb.log')
 run([bin/'pg_ctl.exe','-D',data,'-l',r/'postgres.log','-o','-h 127.0.0.1 -p 55453','-w','start'],'start.log')
 run(['node','-e',"const {Client}=require('pg');(async()=>{const c=new Client({host:'127.0.0.1',port:55453,user:'postgres',database:'postgres'});await c.connect();try{await c.query('CREATE DATABASE calibrate_test_qa453')}finally{await c.end()}})().catch(e=>{console.error(e);process.exit(1)})"],'createdb-node.log',backend)
 run(['node','-r','ts-node/register','--test','test/account-deletion-postgres.test.js','test/account-deletion.test.js'],'focused.log',backend)
finally:
 if (data/'postmaster.pid').exists():run([bin/'pg_ctl.exe','-D',data,'-m','fast','-w','stop'],'stop.log')
 (r/'execution.json').write_text(json.dumps({'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':commands,'databaseStopped':not (data/'postmaster.pid').exists()},indent=2))
print('Focused tests completed; disposable PostgreSQL stopped')
