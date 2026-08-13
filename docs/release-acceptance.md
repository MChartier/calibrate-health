# Integrated release acceptance

This protocol separates implementation completion from external-launch authorization. Automated pull-request gates
must finish on one frozen candidate C. Operator work is deliberately deferred until the implementation stack is
complete; every operator requirement has `blocksImplementation: false` and `blocksExternalLaunch: true` in
`quality/release-acceptance-plan.json`.

## Candidate freeze

Candidate C is the exact lowercase 40-character pull-request head SHA. Pull-request workflows check out
`${{ github.event.pull_request.head.sha || github.sha }}` explicitly, and every retained acceptance artifact contains
a sanitized result that names C. A branch name, merge ref, tag, run SHA from a different event, or abbreviated SHA is
not a candidate identity.

The plan committed in C contains requirements only. It must not contain C, the future evidence commit A, dates,
outcomes, run IDs, receipts, or hashes of evidence that does not yet exist.

## Implementation completion

Run the repository-owned checks and require all hosted jobs in the plan to pass. The full exported Web/PWA suite runs
on Windows with the repository-pinned Playwright version and its bundled Chromium. Hosted Android, Wear, native
upgrade, data-state, database upgrade/rollback, dependency, container, UX, and release-contract jobs all check out C.

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

After the implementation stack is frozen, collect these external-launch receipts without changing application code:

- confirm a real staging alert reaches the configured external destination and its recovery notification arrives;
- review production origins, credentials, retention, backup destination, mail/push configuration, and secret ownership;
- execute the physical Galaxy phone and Galaxy Watch Ultra protocol with the permanent shared signing certificate;
- soak the internal OTA channel, then obtain the configured production-environment approval;
- complete Play Console listing, data-safety, permissions, testing-track, vitals, and release health review;
- complete manual screen-reader, text scaling, keyboard/switch, touch-target, and physical interaction checks;
- approve privacy, legal, support, account-deletion, incident-owner, and current release-note content;
- prove an in-place upgrade from a genuinely distributed predecessor; and
- complete the required private dogfood soak and final owner signoff.

Receipts must be privacy-safe and content-addressed. Hosted evidence uses
`run:<run-id>/artifact:<artifact-name>` references; the verifier downloads the exact GitHub Actions artifact, requires
one JSON file, recomputes its SHA-256, and checks the reviewed gate ID, candidate C, and successful outcome. The
production dependency audit requires distinct root/mobile and backend results. Operator evidence uses
`path:quality/physical-results/<file>.json`; the verifier reads those exact bytes from A, recomputes their SHA-256, and
checks candidate C plus a passed outcome. Store only these bounded references and hashes in the result. Never store
credentials, device serials, account data, raw logs, screenshots with personal data, or signing material.

## Evidence-only child

Once every hosted and operator requirement passes, create one evidence-only commit A directly on C. A must have C as
its sole parent. Its diff may contain only `quality/risk-evidence.json` and allowlisted native evidence JSON under
`quality/physical-results/`. Add `releaseAcceptanceEvidence` to the risk manifest with:

- schema version 1;
- `sourceCommit` equal to C;
- the completion date;
- SHA-256 records for the plan and `shared/release.json` as they existed in C; and
- the exact reviewed number of passed results for every plan requirement, each with resolved, content-addressed GitHub Actions or operator evidence.

Do not record A inside A. Verify from a clean checkout whose HEAD is A:

```powershell
node scripts/dependency-advisory-exceptions.mjs --strict
npm.cmd run release:acceptance:external -- --candidate <C> --evidence <A>
npm.cmd run test:risk-evidence:release -- --candidate <C> --evidence <A>
```

The strict dependency check fails while any reviewed advisory exception remains active, even before its ordinary
expiry. The external-launch verifier also fails until all deferred receipts exist. These failures are intentional and
do not block finishing or reviewing the implementation PR stack.

## Rollback boundary

The actual distributed database base is tag `v0.14.0`, which includes migrations through `0031`. Hosted rollback
rehearsal must start from that immutable tag, upgrade to C, validate representative state, then restore the protected
pre-upgrade data and revalidate it. Do not substitute `v0.13.3` or a synthetic partial migration baseline.
