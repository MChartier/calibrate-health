# Physical Galaxy phone and watch validation

Use this protocol for the release-blocking Galaxy phone and Galaxy Watch Ultra evidence tracked in
issues `#218`, `#219`, `#221`, and `#222`. The longer Play Console worksheet remains the source for
store declarations and policy checks; this document is the focused end-to-end runtime path.

## Evidence boundary

An exploratory debug build is useful for finding device-only defects, but it does not clear the release gate. Final
evidence must use phone and Wear artifacts built from the exact candidate commit, signed by the same permanent
certificate, installed in place, and connected to the candidate HTTPS server. Keep the tested commit checked out
until `npm.cmd run test:risk-evidence:release` passes with the retained result.

Do not uninstall either app, clear app data, lower a version code, or change the application ID or signer during an
upgrade test. Export important account data before testing migrations against real dogfood data.

## Prerequisites

- The phone and watch both appear as distinct `device` rows in `adb devices -l`; always pass `-s <serial>`.
- The watch is paired to the phone through Android before Calibrate pairing begins.
- Samsung Health and Health Connect are installed and synchronized on the phone.
- The candidate server is ready at a credential-free HTTPS origin and has a verified backup.
- Phone and Wear APKs have the same signing certificate SHA-256 fingerprint.
- The candidate version code is greater than the installed version for an upgrade test.

Record the device models, Android/Wear OS versions, APK hashes, signer fingerprint, server image digest, and release
commit before installing anything.

## Install and launch

Use explicit serials and in-place replacement:

```powershell
$phoneSerial='<phone adb serial>'
$watchSerial='<watch adb serial>'
$phoneApk='<absolute phone APK path>'
$wearApk='<absolute Wear APK path>'

adb -s $phoneSerial install -r $phoneApk
adb -s $watchSerial install -r $wearApk
adb -s $phoneSerial shell am start -n app.calibratehealth.mobile/.MainActivity
adb -s $watchSerial shell am start -n app.calibratehealth.mobile/app.calibratehealth.wear.MainActivity
```

Confirm both processes stay alive and capture the crash buffer before and after the protocol. Ignore unrelated Android
process crashes, but fail the run for any `Process: app.calibratehealth.mobile` entry.

## End-to-end protocol

1. On the phone, select and test the candidate self-hosted origin. Register or sign in, restart the app, and confirm
   the server selection and session survive.
2. Complete or review profile and goal setup. Log one manual food entry and one weight, then confirm both on the web
   client and after a phone restart.
3. Connect Health Connect with only the intended data types. Confirm Galaxy Watch steps/activity arrive through
   Samsung Health, display source attribution and sync time, and do not change the fixed calorie target.
4. Revoke one Health Connect permission, sync, then grant it again. Food and weight logging must remain usable and the
   activity state must explain the interruption without duplicating totals after recovery.
5. Pair Calibrate on the watch from the phone. Confirm the selected server/account, current daily summary, recent or
   pinned foods, activity, latest weight, and completion state reach the watch.
6. From the watch, quick-add food, log or replace weight, mark the day complete, undo one watch-created food entry,
   and use continue-on-phone. Confirm each server mutation occurs exactly once and both clients converge.
7. Remove phone network access, queue a phone food write, force-stop the app, restore network, and relaunch. Confirm
   the queued row appears exactly once and pending state clears.
8. Disconnect phone/watch transport and remove watch network access. Queue a watch action, restart the watch app,
   restore transport/network, and confirm exactly-once replay with no stale account or server switch.
9. Exercise the Tile, rotary weight input, round-screen scrolling, ambient/stale states, notification deep links, and
   reminder deduplication. With phone transport absent but watch networking available, verify the bounded watch
   refresh and combined reminder behavior.
10. Upgrade both apps in place with higher version codes while signed by the same permanent certificate. Confirm the
    phone session/server/settings/cache/outbox and watch pairing/cache/Room outbox survive and still reconcile.
11. Capture final phone/watch crash buffers, package versions, signer fingerprints, and the server rows used to prove
    no lost or duplicated food, weight, completion, or activity records.

Any failure invalidates the affected capability. Fix it, build a new higher-version candidate when needed, and repeat
the full affected online/offline path before recording a pass.

## Retained result

Store a result such as `quality/physical-results/galaxy-<date>.json`. The artifact mirrors the fields checked by
`scripts/verify-risk-evidence.mjs`:

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "owner": "MChartier",
  "executedOn": "YYYY-MM-DD",
  "releaseCommit": "40-character-lowercase-git-sha",
  "command": "Followed docs/physical-galaxy-validation.md against the signed candidate",
  "deviceModels": {
    "phone": "Exact Samsung Galaxy model and Android version",
    "watch": "Samsung Galaxy Watch Ultra and Wear OS version"
  },
  "capabilities": [
    "android-physical-happy-path",
    "android-physical-offline-reconnect",
    "wear-physical-happy-path",
    "wear-physical-offline-reconnect"
  ]
}
```

Add the matching record to `physicalDeviceEvidence` in `quality/risk-evidence.json`, point `protocolPath` at this
document and `resultArtifact` at the retained JSON, then remove the
`physical-galaxy-phone-and-watch-validation` waiver. Run:

```powershell
npm.cmd run test:risk-evidence
npm.cmd run test:risk-evidence:release
```

The release command must run at the exact `releaseCommit`; evidence from a different commit cannot clear the gate.
