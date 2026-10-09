# Record of successful experiment commands; run from task-13 unless a location is specified.
# The clone/init/start steps are first-run only. Never point this at another database.
git ls-remote https://github.com/MChartier/calibrate-health.git refs/heads/master refs/heads/mchartier/dormant-account-deletion-421
git clone --no-checkout https://github.com/MChartier/calibrate-health.git validation-453
Set-Location validation-453
git checkout --detach 547206a1b372b73fc95fc412ad453b8099440000
git diff --binary --output=../validation-453.patch 8eb6014adc6ed0ea327fa09fbd2af76afef284d5 c62450c77c7b6a127e04cc698cdcb7d11cb7d762
git apply --index ../validation-453.patch
git write-tree
Set-Location ..
New-Item -ItemType Directory -Path validation-evidence-453,validation-pg-453
& .\pg-test-runtime\node_modules\@embedded-postgres\windows-x64\native\bin\initdb.exe -D .\validation-pg-453\data -U postgres -A trust --encoding=UTF8 --locale=C
$bin = Join-Path $PWD 'pg-test-runtime\node_modules\@embedded-postgres\windows-x64\native\bin'
$cluster = Join-Path $PWD 'validation-pg-453\data'
$pg = Start-Process -FilePath (Join-Path $bin 'postgres.exe') -ArgumentList @('-D', $cluster, '-h', '127.0.0.1', '-p', '55453') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PWD 'validation-evidence-453\postgres.stdout.log') -RedirectStandardError (Join-Path $PWD 'validation-evidence-453\postgres.stderr.log')
$env:NODE_PATH = (Resolve-Path .\deletion-451\backend\node_modules).Path + ';' + (Resolve-Path .\deletion-451\node_modules).Path
node -e 'const {Client}=require("pg"); (async()=>{const c=new Client({host:"127.0.0.1",port:55453,user:"postgres",database:"postgres"});await c.connect();console.log((await c.query("SELECT version(), inet_server_addr(), inet_server_port()")).rows);await c.query("CREATE DATABASE calibrate_test_453_order");await c.end()})().catch(e=>{console.error(e);process.exit(1)})'
$env:CALIBRATE_AUTH_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55453/calibrate_test_453_order'
$env:DATABASE_URL=$env:CALIBRATE_AUTH_TEST_DATABASE_URL
$env:AUTH_PROVIDER='local'
$env:TS_NODE_TRANSPILE_ONLY='true'
Set-Location validation-453\backend
node -r ts-node/register --test test/account-deletion-postgres.test.js
Set-Location ..\..
node validation-evidence-453\ordering.cjs
# Each command above succeeded (exit 0); schemas were dropped by the tests.
# Initial setup-only errors: pg_isready.exe and createdb.exe are absent from the bundled binary package;
# first pg invocation used root node_modules instead of backend node_modules and exited 1.
# Corrected module lookup used existing backend dependencies; no installs or source changes occurred.
