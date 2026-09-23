# Google Play internal testing onboarding

Use [Local native builds and releases](mobile-release.md) for the daily commands: `native:build`, `native:install`,
`native:submit`, and `ota:publish`. This companion guide covers one-time signing and Play Console setup for the
local private-backend profile. Run `npm.cmd run native:setup` and `npm.cmd run native:doctor` before the
first build.

The application ID is `net.darkmachines.healthtracker`. Both phone and Wear use
`https://calibratehealth.darkmachines.net`, Expo channel `internal`, and Play internal tracks `qa` / `wear:qa`.
Testers need WireGuard access to the private backend. Production releases follow the separate [protected store
workflow](native-store-release.md).

## Upload signing

Phone and Wear use one upload keystore. Keep it, its passwords, and an encrypted offline backup outside the
checkout. Enroll both form factors in the same Play App Signing identity. With Google's generated app-signing
key, the upload key signs AAB submissions; Play signs the APKs installed on devices with its separate key.
Use Play for subsequent updates rather than installing an upload-key APK over a Play-installed app.

Generate an upload key with JDK keytool if one does not already exist. Let keytool prompt for passwords:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -storetype PKCS12 `
  -keystore 'C:\secure\healthtracker\upload.p12' -alias healthtracker-upload `
  -keyalg RSA -keysize 4096 -validity 10000
```

Create an external `credentials.json` in [Expo's Android format](https://docs.expo.dev/app-signing/local-credentials/):

```json
{
  "android": {
    "keystore": {
      "keystorePath": "C:\\secure\\healthtracker\\upload.p12",
      "keystorePassword": "FROM_YOUR_PASSWORD_MANAGER",
      "keyAlias": "healthtracker-upload",
      "keyPassword": "FROM_YOUR_PASSWORD_MANAGER"
    }
  }
}
```

Use an absolute keystore path and restrict the directory to your Windows account. Never commit this file,
the keystore, service-account JSON, or passwords. The command rejects credentials and keystores located inside
the checkout, including symlinks resolving inside it. The local command ignores inherited `CALIBRATE_ANDROID_*`
signing variables. Expo prebuild finishes before
the wrapper reads the credentials and supplies them to Gradle.

## Play Console onboarding

1. Sign into [Play Console](https://play.google.com/console/) as `play-admin@darkmachines.net` and finish any
   developer-account verification. Create **Calibrate**, default language English, type **App**, pricing **Free**.
2. Use **Test and release > Testing > Internal testing**. Create/select an email list containing only
   `mchartier@gmail.com`, and save it. Use the Console's tester links to opt in with that account.
3. In **Test and release > Advanced settings > Form factors**, enable Wear OS and its dedicated release track.
   Configure `mchartier@gmail.com` for the Wear internal test too.
4. Enroll in Play App Signing with a Google-generated app-signing key. The first phone AAB upload binds this entry
   permanently to `net.darkmachines.healthtracker`; verify the package before accepting the upload. The display
   name can change later. Upload the Wear AAB to the Wear track under that same application.
5. Complete any required app-content/Health Connect declarations using
   [the health release worksheet](play-console-health-release-checklist.md). Declare the shipped read access to
   steps, active calories, total calories, exercise, and weight. Do not claim Google's reviewers or pre-launch
   devices can access the WireGuard-only backend. Broader release requires a separately planned accessible service.
6. For command-line submissions, create a Google Cloud project/service account and enable **Google Play Android
   Developer API**. In Play Console **Users and permissions**, invite the service-account email with access only to
   this app and permissions **View app information (read-only)** and **Release apps to testing tracks**. Do not grant
   production release permission. Download its JSON key to an external protected file.

Internal testing is the intended distribution mechanism, not Managed Google Play enterprise/private-app
registration. A full public listing and public production rollout are deferred. Google may show a temporary
listing/name before review. Health Connect authorization belongs to the new package and does not carry over
from the old package automatically.

## First upload and later updates

Save the completed credential-file paths for this machine, then prepare the tools:

```powershell
npm.cmd run native:configure -- --credentials-file C:\secure\healthtracker\credentials.json --service-account-file C:\secure\healthtracker\play-testing.json
npm.cmd run native:setup
```

Build both packages with `npm.cmd run native:build`. Upload the phone AAB to
the phone internal track and the Wear AAB to the Wear internal track in Play Console. Use the exact
`local-p@COMMIT` / `local-w@COMMIT` release names printed by the build and complete both rollouts before running
`native:status`. Complete the Console onboarding above before trying the API. For subsequent builds, allocate and
commit a new native version pair before building. See the [build, version, and submit commands](mobile-release.md)
for the complete sequence and output paths.

## Device acceptance

- Confirm the package, phone/Wear versions, and common Play app-signing identity.
- With WireGuard on, exercise login, food/weight logging, Health Connect permissions, Wear pairing, and sync while
  the phone app is backgrounded. The watch relies on the phone relay when it cannot directly reach the server.
- Turn WireGuard off, check recoverable connectivity errors, reconnect, and verify pending operations sync once.
- Submit the next patch and verify in-place updates on both devices through Play. Enable auto-updates if desired.
- Retain Play version screenshots and device screenshots in the release record. Record actual results rather than
  treating a passed command or source review as proof of successful device behavior.

References: [Google internal testing](https://support.google.com/googleplay/android-developer/answer/9845334),
[form-factor tracks](https://support.google.com/googleplay/android-developer/answer/13295490),
[Publisher API tracks](https://developers.google.com/android-publisher/tracks),
[Health Connect publishing](https://developer.android.com/health-and-fitness/health-connect/publish).
