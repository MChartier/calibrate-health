# Google Play, Health Apps, and Data Safety release checklist

This document is a release worksheet for the Android phone and Wear OS artifacts. It is based on the
repository at July 12, 2026. It is not evidence that a Play Console declaration has been submitted or
approved.

Google requires declarations to describe the exact artifacts distributed through Play, including
third-party SDK behavior. Treat the final signed bundles, Play Console answers, and device captures as
the release record. Source review is necessary but is not a substitute for that evidence.

Current requirements used by this worksheet:

- [Publish a Health Connect app](https://developer.android.com/health-and-fitness/health-connect/publish)
- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291)
- [Health content and services policy](https://support.google.com/googleplay/android-developer/answer/16679511)
- [Data Safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Wear OS packaging](https://developer.android.com/training/wearables/packaging)
- [Wear OS release tracks](https://support.google.com/googleplay/android-developer/answer/13295490)

## Evidence labels

- **Confirmed source fact**: directly supported by a named file in this repository.
- **Release decision**: proposed Play Console wording or classification that the publisher must approve.
- **Required evidence**: can be established only from the final artifact, Play Console, a live URL,
  provider terms, or device behavior.
- **Blocker**: resolve before moving beyond owned-device/internal testing.

## Confirmed source facts

| Area | Confirmed behavior | Source |
| --- | --- | --- |
| Android identity | Phone and watch use `app.calibratehealth.mobile`. Phone is version `0.1.0` (code `1`); Wear is version `0.2.0` (code `2`). | `mobile/app.json`, `wear/app/build.gradle.kts` |
| Phone platform | Expo config sets minimum SDK 26, disables backup, requests camera, vibration, and notifications, and blocks storage, microphone, and system-alert-window permissions. | `mobile/app.json` |
| Camera | Camera access is requested only from the barcode screen after explanatory copy. Frames stay in `CameraView`; only the decoded UPC/EAN is sent for lookup. | `mobile/app/barcode.tsx` |
| Profile image | A user-selected image is cropped, compressed, base64-encoded, and uploaded as the optional profile avatar. | `mobile/app/(tabs)/settings.tsx`, `backend/src/utils/profileImage.ts` |
| Notifications | Android notification permission is requested only after a signed-in user acts and the selected server advertises native push support. Expo push is the only implemented native provider and is disabled by default server-side. | `mobile/src/hooks/useNativePushRegistration.ts`, `backend/src/config/nativePush.ts` |
| Health Connect permissions | The phone declares read-only access to steps, active calories, total calories, exercise sessions, and weight. No Health Connect write permission is declared. | `mobile/plugins/withHealthConnect.js` |
| Health Connect selection | Steps, active calories, total calories, and exercise default on after the user connects. Weight is a separate setting and defaults off. | `mobile/src/healthConnect/types.ts`, `mobile/src/healthConnect/permissions.ts` |
| Health Connect sync | Sync runs when the app opens or returns to the foreground while connected and unpaused. It uploads source records, deletions, and daily summaries to the selected Calibrate server. Initial reconciliation is limited to 30 days. | `mobile/src/healthConnect/provider.tsx`, `mobile/src/healthConnect/sync.ts` |
| Health-data use | Imported activity is observational and does not automatically change the profile-based calorie target. Manual weight remains authoritative for its day. | `docs/health-connect.md`, `docs/release-scope.md` |
| Phone local storage | Access and refresh tokens and the generated installation ID use SecureStore. Server URL, Health Connect preferences/checkpoints, and other preferences use app-local storage. Pending mutations use app-local SQLite. | `mobile/src/auth/storage.ts`, `mobile/src/healthConnect/provider.tsx`, `mobile/src/healthConnect/sync.ts`, `mobile/src/offline/` |
| Server transport | Production phone code rejects HTTP origins; development code permits HTTP only for emulator, loopback, and private-network hosts. | `mobile/src/config/server.ts` |
| Account export | A signed-in user can export versioned JSON. It includes profile, avatar, goals, weight, food, recipes, notification history, and Health Connect records/summaries, but excludes credentials, sessions, push endpoints/tokens, device IDs, sync tokens, and tombstones. The phone deletes its temporary export file after the Android share flow returns. | `backend/src/services/accountLifecycle.ts`, `mobile/src/account/accountData.ts` |
| Account deletion | Phone Settings requires the current password plus `DELETE MY ACCOUNT`. The server cascade-deletes account-owned rows and clears the session. The phone independently attempts to clear its outbox, Health Connect grants/state, Wear coordination state, and credentials; a reachable paired watch receives an account-bound local-disconnect command. Failures surface explicit device-cleanup guidance. The public `/account-deletion` page provides hosted-service email instructions without requiring sign-in or app installation. | `mobile/app/(tabs)/settings.tsx`, `mobile/src/account/accountData.ts`, `mobile/src/healthConnect/accountCleanup.ts`, `mobile/src/wear/accountCleanup.ts`, `frontend/src/pages/AccountDeletion.tsx`, `backend/src/routes/user.ts`, `backend/prisma/schema.prisma` |
| Food providers | Search text, barcodes, language, and serving context can be relayed by the Calibrate server to FatSecret, USDA, or Open Food Facts. Account email and ID are not deliberately included in those requests. | `backend/src/routes/food.ts`, `backend/src/services/foodData/`, `frontend/src/pages/PrivacyPolicy.tsx` |
| Lose It import | A selected ZIP is uploaded to the server and parsed in memory. Preview is not persisted; execute creates the selected food and weight records. | `backend/src/routes/imports.ts` |
| Wear permissions | The merged release requests internet, network state, notifications, and normal scheduling support (`WAKE_LOCK`, boot completed, and foreground service). It does not request body sensors, activity recognition, location, camera, microphone, or Health Connect permissions. | `wear/app/src/main/AndroidManifest.xml`, release merged manifest |
| Wear data flow | The watch calls the selected server directly, stores bounded summary/quick-add/outbox state in Room, and stores tokens in a Keystore-encrypted envelope. Data Layer messages carry pairing, invalidation, and handoff metadata rather than server health summaries. | `wear/README.md`, `wear/app/src/main/java/app/calibratehealth/wear/` |
| Wear Play classification | The watch requires the paired phone for initial authentication, so its manifest declares `com.google.android.wearable.standalone=false`. After pairing, normal data sync uses the selected server directly over Wi-Fi/LTE. | `wear/app/src/main/AndroidManifest.xml`, `wear/app/src/main/java/app/calibratehealth/wear/pairing/` |
| Wear backups | The tracked Wear manifest disables Android backup. | `wear/app/src/main/AndroidManifest.xml` |
| Tracking SDKs | No advertising, mobile analytics, or crash-reporting SDK is declared in `mobile/package.json`. | `mobile/package.json` |

## Source-to-release mismatches and unresolved gates

These findings must not be silently converted into affirmative Play Console answers.

1. **Resolved in local release build - phone backup state.** A clean Expo prebuild and test-signed release APK now
   show `android:allowBackup="false"`. Repeat the inspection on the exact uploaded AAB and Play-generated APK; local
   test signing is build-path evidence, not Play Console evidence.
2. **Resolved in local release build - forbidden phone permissions.** The clean test-signed release APK excludes
   `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, and `RECORD_AUDIO`. Its complete
   permission inventory also contains expected transitive infrastructure permissions from SecureStore,
   notifications/FCM, install referrer, and launcher-badge compatibility. Review those normal permissions rather
   than using an incorrect "only app-declared permissions" expectation, and repeat the check in App Bundle Explorer.
3. **Required evidence - external account-deletion URL.** Source now provides a dedicated public
   `/account-deletion` page with signed-in instructions, a hosted-service email request path, verification and
   response timing, retention caveats, and self-hosted operator guidance. Before entering
   `https://calibratehealth.app/account-deletion` in Data Safety, deploy it and confirm that it is publicly
   accessible without login or app installation and that the hosted-service mailbox is monitored.
4. **Required device evidence - deleted-account cleanup.** Source now attempts outbox, Health Connect, Wear,
   and credential cleanup independently after confirmed server deletion. A reachable paired watch validates an
   account-bound command from its exact retained phone node and runs its existing local disconnect. If the watch
   is unreachable, phone data is still cleared and the user is instructed to disconnect on-watch. Verify both
   reachable and unreachable-watch paths on release artifacts and retain the privacy policy's local-copy caveat.
5. **Required device evidence - Wear legal handoff.** Source now exposes Privacy policy and Account deletion on
   the Wear Connection screen. The watch sends an allowlisted destination to the exact paired phone; the phone
   revalidates account/server/node scope and opens only `/privacy` or `/account-deletion` on that server. Confirm
   both actions open the signed-out public pages on a paired release phone/watch.
6. **Required evidence - privacy URL.** The proposed Play URL is
   `https://calibratehealth.app/privacy`. Confirm that it is publicly accessible without login, non-geofenced,
   not a PDF, stable, and displays the same policy reached from the phone's Health Connect privacy flow.
7. **Required evidence - privacy enumeration.** Source now explicitly includes Health Connect source records and
   daily activity summaries in the account-export list. Confirm the final hosted policy contains this wording and
   record its version/date.
8. **Required evidence - provider classification.** The code proves transfers to food providers and, when
   enabled, Expo Push Service. Whether those transfers count as Play "sharing" depends on the publisher's
   provider agreements and Google's service-provider or user-initiated exceptions. Do not answer "no data
   shared" until that classification is documented.
9. **Required evidence - encryption in transit.** Production phone code requires HTTPS, and the default Wear
   release origin is HTTPS. Wear build flags can deliberately enable private-network cleartext for internal
   use. Never use that flag for the Play bundle. Confirm both installed Play artifacts reject HTTP and that the
   merged manifests disable cleartext before answering that all collected data is encrypted in transit.
10. **Required evidence - no hidden SDK collection.** Source dependencies show no analytics or crash SDK, but
    review the final bundle in Play SDK Index/App Bundle Explorer and inspect runtime traffic. Transitive SDK
    behavior must be included in Data Safety.

## Private/internal release decision

**Release decision:** use the Play internal testing track for quick owned-device smoke tests, then complete a closed
testing track before any public release. A longer Play-distributed dogfood should remain on the closed track. Do not call an internal testing release a "private app" in policy
answers. Google uses "private app" for managed enterprise distribution, which has different declaration
exemptions. Complete the Health Apps and Data Safety drafts before entering closed testing even if an
internal-only listing does not display a Data Safety section.

## Artifact gate

- [ ] Update `shared/release.json` first and mirror the phone and Wear versions.
- [ ] Increase both phone and Wear version codes above every uploaded artifact.
- [ ] Run `npm.cmd run release:check` and `npm.cmd run test:release` on a clean release commit.
- [ ] Run mobile typecheck/tests and a clean Expo Android prebuild.
- [ ] Build the exact phone production AAB and Wear release AAB intended for Play.
- [ ] Record Git commit, versions, version codes, SHA-256 hashes, build URLs, and release metadata.
- [ ] Inspect both AABs in App Bundle Explorer; export the generated APKs for device inspection.
- [ ] Save release merged manifests and `aapt2 dump permissions` output.
- [ ] Review the complete phone permission inventory. Expected user-facing/runtime access is camera, notifications,
  and the five read-only Health Connect permissions; expected infrastructure declarations include internet,
  network state, vibration, wake/boot support, biometric-backed SecureStore, FCM, install referrer, and launcher
  badge compatibility. Investigate any permission outside the reviewed artifact inventory.
- [ ] Confirm phone manifest excludes microphone, storage, system-alert-window, location, contacts, body-sensor,
  activity-recognition, and Health Connect write/background/history permissions.
- [ ] Confirm phone `allowBackup=false` in the installed release package.
- [ ] Confirm Wear includes the reviewed internet, network-state, notifications, wake/boot, and foreground-service
  declarations, with backup disabled and no unrelated runtime permission.
- [ ] Confirm both Play artifacts explicitly disable cleartext and reject an `http://` server origin.
- [ ] Confirm the installed phone and watch package names are both `app.calibratehealth.mobile`.
- [ ] Confirm installed Play-generated phone and watch APKs have the same app-signing certificate fingerprint.
- [ ] Distinguish the Play app-signing key from the upload key in the release record. Direct internal APK pairing
  must use matching local certificates; Play-delivered artifacts must match after Play signing.
- [ ] Run Play pre-launch reports and review crashes, ANRs, accessibility, security, and permission findings.
- [ ] Verify device catalog eligibility for the target Galaxy phone and Galaxy Watch Ultra.

## Play Console setup

- [ ] Create or select the listing for `app.calibratehealth.mobile` and enable Play App Signing.
- [ ] Use the **Health & Fitness** app category.
- [ ] Mark **contains ads: no** only after final SDK/bundle inspection confirms no ad code.
- [ ] Complete content rating, target audience, and country/region availability with the actual intended audience.
- [ ] If the intended audience is adults only, configure it that way consistently; do not infer this solely from
  the privacy policy's under-13 statement.
- [ ] Add reviewer access instructions for the authenticated app, including a stable HTTPS server and a dedicated
  review account with completed onboarding. Do not provide a personal production account.
- [ ] Add a public support email and privacy policy URL.
- [ ] Add a prominent account-deletion URL that works without reinstalling or opening the Android app.
- [ ] Complete the Data Safety draft below and attach the provider-role decision record.
- [ ] Complete the Health Apps declaration draft below.
- [ ] Add this exact non-medical disclaimer to the store description unless legal review supplies a stricter one:
  "Calibrate is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.
  Consult a healthcare professional for medical advice, diagnosis, or treatment."
- [ ] State that native phone and Wear clients are English-only in the first release.
- [ ] State that activity is observational and does not automatically alter calorie targets.
- [ ] State that Galaxy Watch activity reaches Calibrate through Samsung Health and Health Connect on the phone;
  the watch app does not collect watch sensor data directly.
- [ ] Upload phone screenshots that show food logging, weight, activity, and the Health Connect controls.
- [ ] Keep health claims limited to tracking, visualization, and user-configured goals.
- [ ] Save screenshots/PDF exports of every submitted App content answer and its approval state.

## Health Apps declaration draft

### Feature categories

**Release decision:** select only:

- **Activity and Fitness**
- **Nutrition and Weight Management**

Do not select medical, disease-management, clinical-decision-support, medical-device, or human-subjects-research
categories. Calibrate tracks user-entered food/weight and optional activity; it does not diagnose, treat, conduct
research, or claim regulated medical functionality.

### Health Connect permission justifications

Use one justification for every permission shown by Play. Keep the data type name and user-visible benefit explicit.

| Permission/data type | Draft Play Console justification |
| --- | --- |
| `READ_STEPS` / Steps | When the user explicitly connects Health Connect, Calibrate reads step records and Health Connect's daily aggregate to show daily steps, source attribution, synchronization status, and recent activity history on the user's phone and paired watch. Steps are observational and do not automatically change the calorie target. Records and summaries sync to the Calibrate server selected by the user so the same history is available across their devices. |
| `READ_ACTIVE_CALORIES_BURNED` / Active calories burned | Calibrate reads active-energy records and daily aggregates to show how much activity energy Health Connect reports for each day, with source attribution and stale-data status. The value provides activity context only and does not add calories to the food budget or automatically modify the user's target. |
| `READ_TOTAL_CALORIES_BURNED` / Total calories burned | Calibrate reads total-energy records and daily aggregates to display Health Connect's observed daily total alongside the app's profile-based estimate. This lets the user review differences without silently replacing the configured target calculation. |
| `READ_EXERCISE` / Exercise sessions | Calibrate reads exercise sessions to show recent exercise duration and session/source details and to calculate the exercise-minutes summary displayed in activity history. Calibrate does not start, edit, or delete Health Connect workouts. |
| `READ_WEIGHT` / Weight | Weight access is off by default and requested only when the user separately enables it. Calibrate imports Health Connect weight records into weight/activity history and account export. A manual Calibrate weigh-in remains authoritative for that local day, and Calibrate never writes weight back to Health Connect. |

Use the following common explanation where the form allows supporting detail:

> Access is read-only, optional, user initiated, and limited to the selected data types. Calibrate reads while the
> app is open or returns to the foreground, first reconciles up to 30 days, and then uses incremental changes.
> Users can pause, disable individual types, manage Android permissions, or disconnect. Imported records are sent
> to the Calibrate server chosen by the user, retained with source attribution, included in account export and
> account deletion, and never used for advertising.

### Health review evidence

- [ ] Upload an artifact whose manifest permissions exactly match the five justifications above.
- [ ] Capture first-connect disclosure, Android permission sheet, partial grant, weight opt-in, pause, disconnect,
  and permissions-rationale deep-link behavior on the release build.
- [ ] Confirm the Health Connect privacy link reached from Android shows the same hosted policy URL entered in Play.
- [ ] Confirm Health Connect rejects undeclared access rather than displaying a generic "can't access" error.
- [ ] Confirm no background/history/write permission appears in the artifact or console declaration.
- [ ] Provide reviewer steps and seeded data that make activity history visible without exposing a real person's data.

## Current data-flow declaration draft

| Trigger | Data | From -> to | Storage/retention | Play treatment to confirm |
| --- | --- | --- | --- | --- |
| Register/sign in | Email, password, generated installation ID, device label/platform | Phone -> selected Calibrate server | Password hash, user row, hashed mobile tokens, session/device metadata | Collected; account management, app functionality, security. Email is required. Password is authentication data but has no separate Data Safety type. |
| Complete profile/goals | Date of birth, sex, height, timezone, units, language, activity level, start/target weight, calorie deficit | Phone -> selected server | Active account until edited/deleted; backups follow operator retention | Personal info, health info, and fitness info; required for core profile/goal math. |
| Log food/weight | Food names, meal period, calories, serving snapshots, weight, local day, completion state | Phone/watch -> selected server | Active account until edited/deleted; immutable food snapshots | Health info and possibly other user-generated content; app functionality/personalization. |
| Build foods/recipes | Custom names, serving values, ingredient snapshots, pin state | Phone -> selected server | Until user/account deletion | Health info and other user-generated content; optional, app functionality. |
| Import Lose It ZIP | Selected file and contained food/weight records | Phone -> selected server memory; parsed records -> database | Raw ZIP is memory-only; executed records persist | Files/docs collected optionally and processed ephemerally; extracted health info persists. |
| Scan barcode | Live camera frames and decoded UPC/EAN | Frames stay on device; decoded barcode -> server -> configured food provider | Frames are not stored or transmitted; barcode may be stored only when the user logs the result | Camera permission disclosure; in-app search history processed ephemerally; provider transfer classification unresolved. |
| Search food | Search text, barcode, language, serving context | Phone -> server -> configured food provider | Not deliberately stored as search history; ordinary provider/server logs may apply | In-app search history, optional/ephemeral; provider transfer classification unresolved. |
| Set avatar | Selected/cropped photo | Phone -> selected server | Resized inline avatar until removed/account deletion | Photos, optional, app functionality/personalization. |
| Connect Health Connect | Steps, active/total energy, exercise sessions, optional weight, data origin/device metadata, deletions, daily aggregates | Health Connect -> phone -> selected server | Source records/summaries until account/operator deletion; sync tokens/preferences local | Health info and fitness info, optional, app functionality/personalization. No Health Connect data is sent to ad systems. |
| Enable native push | Expo push token, generated device ID, reminder title/body/action/local date | Phone -> server; server -> Expo Push Service -> device | Server subscription until revoke/rejection/account deletion; provider retention applies | Device IDs and reminder/app-interaction data; optional. Service-provider/sharing classification unresolved. |
| Use Wear | Pairing/device metadata, tokens, daily health/food/weight summary, quick adds, queued operations | Phone <-> watch for coordination; watch <-> selected server for app data | Bounded Room cache/outbox; tokens in Keystore envelope; backups off | Same package-level health/fitness/device-ID declarations; not a separate Data Safety form when distributed under the same listing. |
| Export account | Versioned account JSON | Server -> phone cache -> user-selected share target | Cache file deleted after share flow; recipient copy is user controlled | User-initiated transfer; verify it qualifies for Play's user-initiated sharing exception. |
| Delete account | Password confirmation and account ID | Phone -> selected server; bounded account-scoped disconnect metadata -> paired watch | Active database rows cascade-delete; phone cleanup removes outbox, Health Connect state/grants, Wear coordination state, and credentials; a reachable watch clears credentials/cache/outbox; operator backups/logs follow policy | In-app and public web mechanisms exist in source. Live URL/mailbox and reachable/unreachable paired-device cleanup remain release evidence. |
| Operate service | IP address, user agent/device/app metadata, request timing/status, bounded diagnostics counters | Phone -> server/reverse proxy | Depends on operator log/backup configuration | Device/other IDs or diagnostics only if the final implementation transmits/retains a covered type. Verify actual production logs and SDK traffic. |

## Data Safety form draft

The Data Safety form is global for every active version under the package. "Collected" means transmitted off the
device, including by SDKs. "Shared" has service-provider, legal, user-initiated, and anonymized exceptions; apply an
exception only after documenting why it fits.

### Top-level answers

- **Does the app collect or share required user-data types?** **Yes.**
- **Is all collected data encrypted in transit?** **Proposed Yes, conditional.** Submit Yes only after the exact Play
  phone and Wear artifacts reject cleartext and all production endpoints/providers use TLS. Otherwise answer No and
  stop the release because health data should not ship over cleartext.
- **Can users request deletion?** **Not ready.** In-app deletion exists; publish and validate the required external
  deletion URL before answering Yes.
- **Independent security review?** **No** unless a qualifying external assessment is completed.
- **Sharing?** **Unresolved.** Complete the provider-role worksheet below first.

### Data types

| Play data type | Collected | Required/optional | Purposes | Shared |
| --- | --- | --- | --- | --- |
| Personal info - Email address | Yes | Required | Account management; app functionality; security | No proposed, subject to provider/log review |
| Personal info - User IDs | Yes | Required | Account management; app functionality; security | No proposed, subject to provider/log review |
| Personal info - Other info | Yes: date of birth, sex, height, timezone, language, units, preferences | Required because core profile fields use this category | App functionality; personalization; account management | No proposed |
| Health and fitness - Health info | Yes: weight/body data, nutrition/food, goals and calorie history | Required for the core tracking profile; individual logs/features can be optional | App functionality; personalization | No proposed except any push-content/provider classification that Play determines is sharing |
| Health and fitness - Fitness info | Yes: activity level, optional steps/energy/exercise | Required for activity level; Health Connect imports optional | App functionality; personalization | No proposed |
| Photos and videos - Photos | Yes: optional avatar | Optional | App functionality; personalization | No proposed |
| Files and docs | Yes: selected Lose It ZIP | Optional; ephemeral raw-file processing | App functionality | No proposed |
| App activity - In-app search history | Yes: food query/barcode, ephemeral | Optional | App functionality | Unresolved for configured food providers |
| App activity - App interactions | Yes: completed-day and notification read/dismiss/resolve state | Optional | App functionality | No proposed |
| App activity - Other user-generated content | Yes: custom food/recipe names and ingredient content | Optional | App functionality | No proposed |
| Device or other IDs | Yes: generated installation/watch IDs and optional push token | Required for mobile/watch auth; push token optional | App functionality; security | Unresolved for Expo Push Service |

Do **not** select location, contacts, calendar, installed apps, web browsing, financial information, audio, SMS,
emails/messages, or advertising data unless final artifact/runtime inspection finds collection not represented by
the reviewed source. Camera permission does not by itself mean camera frames are collected: the barcode flow keeps
frames on-device. Select crash logs, diagnostics, or analytics only if the final SDK/runtime review proves those
types are transmitted from the app.

### Provider-role worksheet

| Recipient | Data | Enabled when | Decision evidence required |
| --- | --- | --- | --- |
| Selected Calibrate server | All account and tracking data needed by the service | Always after sign-in; may be hosted or user-selected self-host | Identify the Play publisher/first party, explain user-selected self-hosts, and confirm operator privacy terms. |
| FatSecret, USDA, or Open Food Facts | Food query/barcode, language, serving context, server request metadata | User searches/scans and operator config selects provider | Record provider, terms/DPA, retention, and whether service-provider or user-initiated exception applies. |
| Expo Push Service and downstream platform push | Expo token, reminder content/action metadata | Operator enables Expo mode and user grants notifications | Record Expo terms/DPA, downstream handling, retention/deletion behavior, and service-provider classification. |
| User-selected Android share target | Account export JSON | User explicitly taps export and chooses target | Record user-initiated sharing exception; the target's policy governs the recipient copy. |

If any recipient is a third party rather than a qualifying service provider or user-initiated exception, mark the
corresponding data types as shared and state the applicable purposes. Never use "advertising or marketing"; source
behavior does not support that purpose.

## Runtime permission and disclosure checks

- [ ] Camera prompt appears only after opening barcode scan and explanatory text says it scans packaged-food barcodes.
- [ ] Denying camera keeps manual food entry usable; "don't ask again" routes to Android settings.
- [ ] Camera frames and images are absent from network captures and server logs; only the decoded code is transmitted.
- [ ] Notification prompt appears only after user action and only when the selected server advertises native push.
- [ ] Denying notifications keeps food, weight, activity, and in-app reminders usable.
- [ ] Health Connect access starts only from the Health Connect card after the in-app disclosure is visible.
- [ ] The requested Health Connect subset matches visible toggles; weight is not requested until separately enabled.
- [ ] Partial grant, pause, revoke, disconnect, reinstall, and upgrade behavior matches the disclosure.
- [ ] No permission is requested on first launch without a directly related user action.
- [ ] Galaxy Watch activity delay language is visible and no direct watch-sensor collection is implied.

## Account export and deletion checks

- [ ] Export from a seeded account and compare the JSON with every account-owned Prisma model.
- [ ] Confirm activity records and summaries are present, while password hashes, sessions, tokens, device IDs,
  provider endpoints, sync checkpoints, and tombstones are absent.
- [ ] Confirm the temporary phone export file is deleted after successful, canceled, and failed share flows.
- [ ] Delete a seeded account from phone Settings with the correct password and required phrase.
- [ ] Confirm all server account relations, browser/mobile/watch sessions, pairings, subscriptions, notification
  delivery state, and Health Connect source/summaries are gone.
- [ ] Confirm the deleted account cannot refresh phone or watch credentials.
- [x] Source implements independent cleanup of the phone outbox, Health Connect grants/state, Wear coordination
  state, credentials, and reachable paired-watch cache/outbox. Device validation remains required for both reachable
  and unreachable-watch paths.
- [ ] Document operator backup/log retention and demonstrate a supported removal request path for the hosted service.
- [ ] Publish a dedicated deletion webpage or anchored section that names Calibrate, accepts a request without the
  app, explains identity verification, explains backup/log retention, and gives an expected completion time.
- [ ] Enter that exact public URL in Play Console and test it signed out, in a private window, and from another region.

## Wear OS release checks

- [ ] Build a Wear release AAB and upload it to the dedicated Wear OS track for the same Play listing/package.
- [ ] Add Wear OS under **Test and release > Advanced settings > Form factors**, use a dedicated Wear track, upload
  a Wear screenshot, agree to the Wear review policy, and opt in.
- [ ] Provide at least one accurate 1:1 Wear screenshot of at least 384 x 384 pixels. Include the Tile because the
  app offers one; do not add a device frame or marketing overlay.
- [ ] Verify `com.google.android.wearable.standalone=false`: phone-assisted authentication/pairing is required, while normal post-pairing server sync still works over watch Wi-Fi/LTE.
- [ ] Verify food quick-add, undo, day completion, weight, Tile, disconnected refresh, local reminder dedupe,
  pairing, disconnect, and stale/offline states on Galaxy Watch Ultra.
- [ ] Verify no direct sensor, exercise, body-sensor, location, camera, or microphone permission appears.
- [x] Source provides discoverable Privacy policy and Account deletion actions on the Wear Connection screen. Each
  request is account/server-bound, accepted only from the stored paired node, and opens a fixed public path on the
  selected Calibrate server without sending credentials or a free-form URL.
- [ ] Verify both Wear legal handoffs open the signed-out public pages on the paired release phone.
- [ ] Confirm a phone account deletion invalidates and clears the paired watch without exposing the prior user's cache.
- [ ] Save installed-package signing fingerprints from phone and watch as release evidence.

## Release evidence record

Store this completed record with release metadata, outside the repository if it contains reviewer credentials:

```text
Release commit:
Phone version/version code/SHA-256:
Wear version/version code/SHA-256:
Play app-signing certificate SHA-256:
Phone merged-manifest path/hash:
Wear merged-manifest path/hash:
Privacy policy URL and captured date:
Account deletion URL and captured date:
Health Apps declaration submitted/approved date:
Data Safety declaration submitted/approved date:
Provider-role decision owner/date:
Phone device/API/build tested:
Watch device/Wear OS/build tested:
Pre-launch report URL/result:
Known limitations:
Reviewer account escrow location:
```
