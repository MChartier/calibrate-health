# ADR 0003: Separate phone and Wear runtimes behind explicit contracts

- Status: Accepted
- Date: 2026-07-12

## Context

The Android phone client uses Expo, React Native, and TypeScript under `mobile/`. Expo prebuild owns
`mobile/android/`, while the phone's Wear Data Layer bridge is a small Expo native module under
`mobile/modules/wear-pairing/`. The watch needs Wear-specific Compose, Room, WorkManager, Tile, rotary-input,
and Keystore behavior that must not be rewritten by an Expo prebuild.

The two clients share server behavior but cannot directly share TypeScript/Kotlin implementation. They also need
Data Layer discovery, which requires matching application IDs and signing certificates.

## Decision

Keep the watch as a standalone native Kotlin/Compose project under `wear/`. Keep phone product flows in the Expo
project and isolate Android-only phone/watch bridging in the Expo native module. Phone and watch artifacts use the
same `app.calibratehealth.mobile` application ID and signing identity, while retaining separate build systems.

The backend is the canonical health-data boundary. The phone consumes the OpenAPI-backed
`@calibrate/api-client`; the watch consumes the restricted `/api/v1/watch` snapshot and mutation contract through
strict Kotlin wire mappers. Data Layer carries only versioned, size-bounded coordination messages for pairing,
sync invalidation, and continue-on-phone handoff. It does not carry food, weight, or activity snapshots.

Cross-language protocol values are explicit mirrors in the phone module and watch project. A protocol change must
update both sides and their contract tests in one change. Shared release metadata verifies application identity and
version compatibility, but it does not make TypeScript and Kotlin source interchangeable.

## Consequences

- Expo prebuild can regenerate phone Android output without deleting or rewriting the Wear application.
- Each client can use its platform's storage, background-work, and UI primitives.
- Backend API changes must preserve both the generated phone client and the strict watch parser.
- Data Layer cannot become an alternate health-data cache or transport without replacing this decision.
- Phone and watch release artifacts must be built and tested as a signing-compatible pair.
