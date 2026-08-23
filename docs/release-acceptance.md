# Integrated release acceptance

This protocol separates implementation completion from external-launch authorization. Acceptance is scoped to the
surface being released: `server-web`, `ota`, or `native`. A mixed release declares multiple scopes and takes the union
of their requirements. Automated pull-request gates still bind their retained results to one frozen candidate C, but a
server/Web or OTA release does not inherit unrelated native packaging, Wear, physical-device, signing, Play Console,
or distributed-upgrade requirements. Operator work is deliberately deferred; every operator requirement has
`blocksImplementation: false` and `blocksExternalLaunch: true` for its declared scopes in
`quality/release-acceptance-plan.json`.

## Candidate freeze

Candidate C is the exact lowercase 40-character pull-request head SHA. Pull-request workflows check out
`${{ github.event.pull_request.head.sha || github.sha }}` explicitly, and every retained acceptance artifact contains
a sanitized result that names C. A branch name, merge ref, tag, run SHA from a different event, or abbreviated SHA is
not a candidate identity.

The plan committed in C contains requirements only. It must not contain C, the future evidence commit A, dates,
outcomes, run IDs, receipts, or hashes of evidence that does not yet exist.

## Release scopes

Evidence child A declares one or more scopes in `releaseAcceptanceEvidence.releaseScopes` using canonical order:

- `server-web` covers the API, database, production container, exported Web/PWA, browser data states, and Web UX.
- `ota` covers an Expo JavaScript/assets update, shared Web/UX behavior, and OTA promotion.
- `native` covers phone and Wear packages, emulator behavior, signing, package upgrade, Play Console, and physical
  devices.

Mixed releases list every applicable scope and require the union without duplicate evidence. Requirements that do not
name a selected scope must be omitted from the result. Missing, empty, duplicated, unknown, or non-canonical scope
data is invalid and falls back to the full requirement set so malformed metadata cannot weaken acceptance.

## Implementation completion

Run the repository-owned checks and require the hosted jobs selected by the release scopes to pass. Server/Web
releases use Web, data-state, database, dependency, container, UX, and contract results. OTA releases use Web,
data-state, dependency, UX, and contract results without native package or emulator evidence. Expo runtime changes
still export a production Android Metro bundle on the PR, catching native-only module resolution and transform
failures without creating retained native-package evidence. Native releases use Android, Wear, package upgrade,
dependency, and contract results. Every retained job still checks out C. The Windows Web suites continue to
use the repository-pinned Playwright version and its bundled Chromium. Deterministic bundle-size budgets remain
blocking. GitHub-hosted LCP, CLS, and INP measurements run once as a non-blocking diagnostic because shared-runner
contention is not representative release evidence; production field aggregates remain the operational signal.

Path-targeted PR validation can intentionally skip a retained job when its surface did not change. A skipped job is
not release evidence. Before external launch, manually dispatch the corresponding workflow from C's branch after its
final push: `Builds` for missing Web or native artifacts, `Database Upgrade` for the server/Web rollback artifact,
`Dependency Audit` for both production dependency graphs, and `Production Container Scan` for the server/Web image.
Manual dispatches force the complete workflow and bind retained summaries to the selected ref's `github.sha`; verify
that SHA equals C before using the artifacts. `Builds` also requires `native_upgrade_baseline`; enter the lowercase
full Git SHA of C's pull-request base so the package-upgrade rehearsal covers the complete candidate change.

The data-state lane uses only synthetic `.invalid` fixtures. Its raw Playwright JSON remains runner-local because
standard reports can include host paths and failure attachments; the retained artifact is the fixed sanitized summary
that binds the blocking job outcome to C. Native retained artifacts likewise contain only their strict allowlisted JSON.

Use this local contract check while the PR is in progress:

```powershell
npm.cmd run release:acceptance
npm.cmd run test:release
```

Pending operator rows are expected output and do not fail this implementation check.

## Deferred operator ledger

After the implementation stack is frozen, collect only the receipts selected by the release scopes:

- `server-web`: confirm staging alert and recovery delivery.
- All scopes: review the applicable production configuration and secret ownership.
- `native`: execute the physical Galaxy phone and Watch protocol with permanent signing.
- `ota`: soak the internal OTA channel and obtain production-environment approval.
- `native`: complete Play Console listing, declarations, testing-track, vitals, and release health review.
- All scopes: complete the applicable manual accessibility and interaction checks.
- All scopes: approve applicable privacy, legal, support, incident-owner, and release-note content.
- `native`: prove an in-place upgrade from a genuinely distributed predecessor.
- All scopes: complete the required private dogfood soak and final owner signoff.

Receipts must be privacy-safe and content-addressed. Hosted evidence uses
`run:<run-id>/artifact:<artifact-name>` references; the verifier downloads the exact GitHub Actions artifact, requires
one JSON file, recomputes its SHA-256, and checks the reviewed gate ID, candidate C, and successful outcome. The
production dependency audit requires distinct root/mobile and backend results. Operator evidence uses
`path:quality/physical-results/<file>.json`; the verifier reads those exact bytes from A, recomputes their SHA-256, and
checks candidate C plus a passed outcome. Store only these bounded references and hashes in the result. Never store
credentials, device serials, account data, raw logs, screenshots with personal data, or signing material.

## Evidence-only child

Once every selected hosted and operator requirement passes, create one evidence-only commit A directly on C. A must
have C as its sole parent. Its diff may contain only `quality/risk-evidence.json` and any selected native evidence JSON
under `quality/physical-results/`. Add `releaseAcceptanceEvidence` to the risk manifest with:

- schema version 2;
- the non-empty, canonical `releaseScopes` array;
- `sourceCommit` equal to C;
- the completion date;
- SHA-256 records for the plan and `shared/release.json` as they existed in C; and
- the exact reviewed number of passed results for every selected requirement, each with resolved, content-addressed
  GitHub Actions or operator evidence.

Do not include result records for requirements outside the selected scopes.

Do not record A inside A. Verify from a clean checkout whose HEAD is A:

```powershell
node scripts/dependency-advisory-exceptions.mjs --strict
npm.cmd run release:acceptance:external -- --candidate <C> --evidence <A>
npm.cmd run test:risk-evidence:release -- --candidate <C> --evidence <A>
```

The strict dependency check fails while any reviewed advisory exception remains active, even before its ordinary
expiry. The external-launch verifier also fails until all selected deferred receipts exist. These failures are
intentional and do not block finishing or reviewing the implementation PR stack.

## Rollback boundary

For a `server-web` release, the actual distributed database base is tag `v0.14.0`, which includes migrations through
`0031`. Hosted rollback rehearsal must start from that immutable tag, upgrade to C, validate representative state,
then restore the protected pre-upgrade data and revalidate it. Do not substitute `v0.13.3` or a synthetic partial
migration baseline. OTA-only and native-only releases do not require this database rehearsal.
