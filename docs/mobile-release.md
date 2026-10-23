# Local native builds and release commands

All release planning, building, submission and recovery use `npm run release -- ...`. Device installation and machine setup stay separate. Run these commands from a clean committed checkout with Node 22.14 or later.

## Configure EAS credentials once

```powershell
npm.cmd run native:setup
npm.cmd run native:configure
```

Setup prepares the Windows Android toolchain; `native:setup -- --check` is read-only. Configure uses the toolkit's locked EAS CLI to authenticate, provision/reuse the default upload key and download the Play submission key assigned to the exact linked project and `net.darkmachines.healthtracker`. It uses an external credentials workspace and saves only absolute paths in `%LOCALAPPDATA%/calibrate-health/expo-release.json`. A failed refresh preserves prior settings; no assigned Play key clears stale submission settings while allowing builds. Credentials remain outside the checkout. See [Play onboarding](android-internal-testing.md).

## Build, install and submit

The local profile uses `https://calibratehealth.darkmachines.net`, Expo channel `internal`, and the existing phone/Wear version metadata. Ensure that committed codes are unused and exceed previous reservations/uploads before a new store upload; local build does not allocate or commit versions. Inspect hosted reservations with `release -- status` first.

```powershell
npm.cmd run release -- plan --operation build --profile local
npm.cmd run release -- run --local
```

The common runner performs credential-free prebuild, then reads external signing credentials, compiles both APKs/AABs, checks embedded application/server/runtime metadata and writes a receipt under `.release/`. Use the exact receipt path printed by the build:

```powershell
npm.cmd run native:install -- --receipt .release/artifacts-DIGEST.json
npm.cmd run release -- plan --operation submit --receipt .release/artifacts-DIGEST.json
npm.cmd run release -- run --local --receipt .release/artifacts-DIGEST.json
```

Install is optional and reuses verified files. Submit verifies the same receipt and bytes, uploads phone/Wear to `internal` / `wear:internal` and reads back results. Coordinate Console edits before submission. Local publication evidence uses the common GitHub Release ledger with an explicit local origin and cannot be promoted into protected hosted provenance.

For one run, `run --local --credentials-file ABSOLUTE_PATH` overrides Android signing, and `run --local --receipt FILE --service-account-file ABSOLUTE_PATH` overrides Play authentication. `native:install -- --receipt FILE --phone-serial SERIAL --watch-serial SERIAL` selects devices. In-place install still verifies package identity, signing compatibility and retained artifacts.

Inspect an interrupted local upload with `release -- recover --release-id ID`. Resume it explicitly with `--resume --local --receipt FILE`; unknown remote outcomes remain blocking. Do not build again to recover an upload.

## OTA and protected releases

```powershell
npm.cmd run release -- plan --operation ota --targets ota-internal
npm.cmd run release -- run
```

OTA and protected submission/promotion dispatch Actions. Production approval remains inside the shared worker. Internal OTA preserves source validation; production requires the retained native runtime. Use a full `release -- plan` for automatic component selection and reservations. See [protected releases](native-store-release.md) for stage ordering and recovery. Device receipt validation is evidence of package integrity, not evidence of physical-device behavior; perform the phone/Wear acceptance checks separately.
