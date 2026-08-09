# Database rollback rehearsal

The hosted rollback gate proves that the current database candidate can upgrade the last immutable distributed
server schema, and that the encrypted pre-upgrade backup can restore that exact predecessor into a new empty
database. It never connects to a caller-provided database.

## Frozen contract

- Predecessor: annotated tag `v0.14.0`, commit `190e55c625fe106c2c85a7439b60a5a02f4257be`.
- Predecessor ledger: 35 migration folders through `0031_calibration_insights`, SHA-256
  `80165f5680e7fe93541a59d4bac0317f8233a7f160bcedac033f3c78c1876a38`.
- Candidate ledger: 42 migration folders through `0038_settings_trust_center`, SHA-256
  `5d0eb7f2ec2f997b31adb9fe60e5ae2a23e8a1d7a74e688e3952df5502ceadd0`.

The script verifies the tag object, commit, release manifest, migration names, migration bytes, candidate ancestry,
and a clean candidate checkout before contacting Docker. `v0.13.3` is not the rollback base.

## Automated sequence

`node scripts/postgres-rollback-smoke.mjs`:

1. Generates collision-resistant names for one internal Docker network, two tmpfs-backed Postgres containers, two
   volumes, the production backup image, and short-lived helper containers.
2. Refuses remote Docker endpoints, non-loopback published database ports, existing generated-name collisions, and
   resources without this run's ownership label.
3. Applies the exact `v0.14.0` migration tree to the source database through Prisma's production `migrate deploy`
   path and inserts representative account, goal, weight trend, food/day, saved-food, browser/mobile-session,
   browser/native-push, calibration recommendation, and calorie-plan revision records.
4. Runs the repository's production `backup-postgres.sh` with a one-run age identity. It verifies that the backup
   volume contains exactly one completed age-encrypted custom dump plus `.last-success`, contains no plaintext or
   partial dump, and removed an owned expired encrypted-backup sentinel.
5. Applies candidate migrations through `0038`, verifies the exact candidate ledger and retained data, and checks
   the intended recommendation-staleness transform and the new safety, onboarding, session, reminder, and index
   schema.
6. Proves the restore database has zero user tables, then runs the production guarded `restore-postgres.sh` against
   it. The restored database must exactly match the predecessor migration ledger and representative snapshot.
7. Re-applies the candidate migration ledger to the restored predecessor and repeats candidate data/schema checks.
8. Removes only resources that still carry this run's ownership label and removes only its generated temporary
   migration tree. Cleanup runs in `finally`; an ownership mismatch fails the rehearsal instead of deleting the
   resource.

The script captures subprocess output and emits only sanitized stage messages. Database passwords, connection URLs,
absolute repository/temporary paths, and Docker resource identifiers are absent from retained success evidence.

## Commands and retained evidence

The dependency-free contract suite does not contact Docker or Postgres:

```text
node --test scripts/postgres-rollback-smoke.test.mjs
```

The full hosted rehearsal requires a full-tag checkout, Docker, Node, and installed backend dependencies:

```text
npm --prefix backend ci --no-audit --fund=false
node scripts/postgres-rollback-smoke.mjs
```

No Postgres workflow service, `DATABASE_URL`, age key, database password, or operator secret is accepted. Hosted
workflows set `CALIBRATE_SOURCE_COMMIT` to the selected lowercase full release-source SHA; when present, it must
exactly match the clean checkout's `HEAD`. Local runs may omit it. The result is always written to
`.codex-screenshots/postgres-rollback-smoke/result.json` with schema version 1 and scope
`postgres-rollback-smoke`. Success evidence records only:

- immutable predecessor and candidate commits/migration ledgers;
- encrypted backup format and basename;
- plaintext/completed-artifact and retention checks;
- base seed, candidate upgrade, empty-target restore, exact predecessor restore, and candidate re-upgrade booleans;
- total duration.

On failure, the same path receives a sanitized `status: failed` result when the evidence directory is writable.

## Operator follow-up

This disposable gate does not claim that an operator fetched an off-host production backup, supplied a production
age identity, stopped traffic, launched the matching prior production image, or completed post-restore sign-in,
food/weight writes, export, native refresh, and reopening checks. Those environment-specific actions remain a
separate staging/production launch protocol and do not block this automated implementation.
