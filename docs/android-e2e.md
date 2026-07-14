# Android end-to-end test

The adb-driven E2E test exercises a real debug client, backend, Postgres database, and Android emulator. It proves:

- authenticated startup using the seeded development account;
- one-tap recent-food logging reaches the API once;
- an airplane-mode write is persisted in the SQLite outbox;
- the queued write survives process death;
- reconnect and relaunch replay it exactly once;
- a second relaunch does not duplicate it;
- the app process remains alive with no Calibrate process entry in Android's crash buffer.

## Prerequisites

Start a disposable Postgres database and apply the real migration chain:

```powershell
docker run --rm -d --name calibrate-e2e-postgres `
  -e POSTGRES_USER=calibrate `
  -e POSTGRES_PASSWORD=calibrate_e2e `
  -e POSTGRES_DB=calibrate_e2e `
  -p 127.0.0.1:55432:5432 postgres:16-alpine

$env:DATABASE_URL='postgresql://calibrate:calibrate_e2e@127.0.0.1:55432/calibrate_e2e?schema=public'
npm.cmd --prefix backend run db:migrate
npm.cmd --prefix backend run db:seed
```

Start the backend and Metro in separate terminals:

```powershell
$env:DATABASE_URL='postgresql://calibrate:calibrate_e2e@127.0.0.1:55432/calibrate_e2e?schema=public'
$env:SESSION_SECRET='calibrate-e2e-session-secret'
npm.cmd --prefix backend run dev

$env:NODE_ENV='development'
npm.cmd --prefix mobile start -- --localhost
```

Install the current debug APK on a booted emulator, then run from the repository root:

```powershell
npm.cmd run test:android:e2e
```

The script defaults to `http://127.0.0.1:3000`, the seeded `test@calibratehealth.app` account, and the standard
Android SDK path under `%LOCALAPPDATA%`. Override `CALIBRATE_E2E_API_URL`, `CALIBRATE_E2E_EMAIL`,
`CALIBRATE_E2E_PASSWORD`, or `ADB` when needed. Use only disposable test data: the script deliberately clears the
emulator app sandbox and adds food logs.

Stop the disposable database when finished:

```powershell
docker stop calibrate-e2e-postgres
```
