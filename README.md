# Independent QA — PR436 / issue435

**Verdict: ready** for the recorded revision. This is an independent assessment, not human approval or a readiness mutation. Owner of this nonmerged retained record: QA task 01a1143e-b348-745e-ab17-2f04d2301010. Retain this evidence ref and commit throughout PR/review lifetime; never merge it into product history or silently replace its identity. Historical implementation evidence remains at its original retained commits.

## Exact assessment

- Head: d94a34d019bd9d993c27d33dbc1accc2cce61a87
- Actual target/base/merge-base/ultimate target: master 4cbcbc740fbe5fa5646b4de31951c79a653176d5
- Unmerged parent PRs: none
- Exact API-decoded UTF-8 PR-body SHA256: 9c644b441193e0b88b817cfd5d5d958ff4f9e11433555504038e51db2b910e67
- Checked at: 2026-10-07T02:56:39.013Z
- [Full structured verdict](qa-verdict.json), [published scope](scope.json), [full feedback and dispositions](feedback.json), [CI/skip explanations](ci.json), [pinned acknowledgment](pinned-read-acknowledgment.json).

## Findings

The human-reported problem is supported by source-level reproduction: the calendar already returns saved comparisons while the base single-day serializer omits them. The change restores completed-day target display, using only the first saved snapshot and current stored intake. It does not manufacture legacy history or mutate snapshots on a read. The complete published history is two linear scoped commits / ten files / +138 -13, with no evidence add/delete churn, unrelated commits, migrations or release modifications. The final child updates API wording and its generated comment mirror only.

Phone and watch completions read comparisons inside their existing transaction and store the same result in sync/operation responses. Existing snapshot capture rules remain unchanged. Reopen/recomplete and later profile/goal changes preserve the first snapshot; noncomplete days do not expose it. Input checks reject nonpositive/partial/nonfinite/noninteger targets or maintenance, missing/invalid timestamps, invalid intake and overflow. Zero intake remains valid. No current-plan read is used for stored completed history.

The API normalizer preserves valid, null and omitted optional fields. The read-and-record wrapper returns the full day unchanged, mutation success caches the full server response and invalidates day/range queries, and queued replay refetches authoritative currentControl state. Old receipts remain historical and may initially omit the comparison; a fresh read supplies it. Pending offline completion correctly avoids inventing a saved target.

## Independent behavior and supporting CI

- [33 maintained backend tests](qa-backend.log) passed, single worker, in isolated current-head sources, including mutation/sync and idempotency contracts. Existing read-only dependency binaries were reused; no owner files or live database were touched.
- [49 additional boundary scenarios](qa-boundaries.json) passed. [QA harness](qa-boundaries.cjs) tests current versus historical completed days, current-open target, zero/under/on/over intake, invalid snapshot fields/timestamp/totals, user/date scoping and API normalization of valid/null/omitted payloads. Both actual base and final serializers reproduced all four retained screenshot response fixtures. Harness initially required module-resolution setup corrections; the final run passed without product changes.
- [Three browser regressions](qa-browser.log) independently passed in Chrome using an isolated copy of the verified retained export and current-head test/fixture source: current 2100 target becomes saved 2000 on completion (300 → 200 remaining), reload retains it, and historical omitted/null fields stay unavailable. One worker, isolated loopback preview, subsequently stopped. This was not an independent rebuild or physical-device run.
- Exact-head CI logs independently read: 764 backend tests, 1283 client tests / 234 suites passed. Five workflows and fourteen checks succeeded; eleven configured skips have explicit reasons in ci.json. No failed/pending/cancelled check is waived.

## Pixels and provenance

[Original retained provenance](https://github.com/MChartier/calibrate-health/blob/7dd85c054275e336e1c42ff3b85ec6442d426c67/README.md) and [manifest](https://github.com/MChartier/calibrate-health/blob/7dd85c054275e336e1c42ff3b85ec6442d426c67/manifest.json) were fetched via GitHub and verified byte-for-byte. All fifteen manifest entries, both synthetic serialization outputs, capture/normalization code, source fixture/config/build scripts, timestamps and served bundle hashes were inspected. Retained Before and After bundles match the recorded SHA256. [Verified source identities](source-identities.json) establish the unchanged client/build/fixture/cache inputs. The current source only adds corrected API comments after captured 3ac32ffa92f1e429dd689e2f52683bd8ea045d15; it does not relabel those captures as current-head images.

All four original images were independently opened. For valid saved history, Before shows unavailable plus 1800 logged; After shows 90% eaten and 200 remaining. Both missing-history images remain unavailable. The deterministic unavailable captures are byte-identical, with separate execution timestamps and no evidence of substitution. The unchanged unavailable layout is taller; the shorter valid layout naturally reveals Evening Snack. The compared balance is neither clipped nor masked. Both pairs use identical synthetic data, viewport, scale, light theme, selected date and clock. The harness suppresses unrelated transient PWA notices consistently and discloses that normalization. No image generation, cropping or redaction is used.

Actual GitHub PR-page rendering is explicitly **waived, not verified**, under [the human amendment](https://github.com/MChartier/calibrate-health/issues/405#issuecomment-6022754087). Original image bytes and genuine pixels remain verified; there is no baseline or provenance waiver.

## Feedback, presentation and limits

Every current issue/PR conversation, submitted review and inline body was read with pagination. No actionable feedback remains. The quota-only bot refusal is recorded honestly: it did not review the captured parent or documentation child; this full-head independent review uses only the narrow human exception. Issue435 follows the fixed requirements template and links its verified implementing task ID and actual PR. Native closing association and Project Current PRs both read back PR436. The concise final PR explains the actual base problem, final repair, expected/observed behavior and visibly embeds labeled genuine Before/After pairs beside the Test plan. It does not ask the reviewer to reconstruct iteration history.

No live records, backfill, deployed-server/actual OTA, physical-device or live PostgreSQL exercise was performed. The particular reported records and deployed versions remain unknown; legitimately absent historical snapshots will still be unavailable. These limits are disclosed in the PR and do not undermine the reproduced scoped serializer defect.

Before any readiness mutation the coordinator must separately bind the API-read-back concise comment ID/full body digest from this trusted QA task, then recheck head/base/parents/body, provenance identities and full feedback. No readiness label, draft transition, approving review, merge, release, deployment or credential/provider/security change was performed by QA.
