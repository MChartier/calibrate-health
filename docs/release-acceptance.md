# Release acceptance

Calibrate uses a lean **single-user pre-release** policy. Pull-request checks protect the application surfaces a
change can affect, while the owner decides whether an external release needs additional confidence work. The policy
does not try to reproduce the operating bar of a public, multi-user service.

`quality/release-acceptance-plan.json` is the machine-checked summary of this policy. Run
`npm.cmd run release:acceptance` to verify that its automatic and manual job references still match the workflows.
The plan records capabilities, not release outcomes. It does not require retained results, an evidence-only child
commit, a receipt ledger, or a second external-launch approval step.

## Automatic pull-request checks

Automatic checks are path-targeted. A change runs only the builds, tests, type checks, database checks, and
container checks that can catch a regression on an affected surface.

The Builds workflow provides these focused checks:

- Release configuration validation when workflow, release, deploy, generated-contract, or related configuration
  files change.
- Backend compilation for backend or shared-server changes.
- Expo web export plus a compact critical-route browser smoke for web changes.
- Android Metro export for native runtime changes.
- Phone packaging only for native packaging inputs, and Wear build/JVM tests only for Wear inputs.

Database populated-upgrade checks run for database-relevant changes. Pull requests run the encrypted rollback
rehearsal when Prisma migrations or the rollback workflow/harness change. Production-image build/startup/web smoke
and OS-vulnerability checks remain automatic for affected inputs. Full image scans, including package libraries,
run on the existing Monday 14:15 UTC schedule or manual dispatch. The new-release worker runs exact metadata/image
validation and waits for its candidate PR checks to pass; it does not duplicate those checks in release jobs.

Generated version-only `release/v*` pull requests still validate synchronized release configuration, but suppress
unrelated web, phone, and Wear build fan-out.

## Dependency maintenance

**Dependency Audit** checks root/mobile production dependencies, backend production dependencies, and the locked
EAS CLI every Monday at 13:30 UTC. Run it manually with `workflow_dispatch` when investigating or upgrading packages.
It audits the lockfiles without installing dependencies, reports high/critical findings through the workflow logs
and failed jobs, and lets all three workspaces finish even if one reports findings.

Application-package advisories do not run on pull requests, pushes to `master`, or merges; container OS checks
remain. Release configuration checks also do not enforce package advisories or expiring exceptions. Review maintenance findings and apply compatible upgrades in
focused follow-up pull requests; an unresolved advisory does not block unrelated changes or release cuts.

## Explicit extended validation

The full browser, data-state, accessibility, visual-regression, Android emulator, Wear emulator, and same-signer
upgrade suites are available through a manual **Builds** dispatch. Choose `web`, `native`, `web-and-native`, or
`configuration-only`. Select the native upgrade rehearsal only when it is useful; that option requires the full
lowercase Git SHA of the package baseline.

These suites are diagnostics, not standing PR or release gates. Manual UX and native emulator runs keep short-lived
diagnostic artifacts for seven days to help investigate a failure; those artifacts are not release receipts.

The manual **Optional Release Confidence** workflow checks an exact candidate commit's release mirrors, root/mobile
production dependency audit, deploy contracts, generated API contract, and clean worktree. It is an owner-discretion
review aid and does not authorize or record an external launch.

## Cut server/web release

After the desired changes land on `master`, **Release server** creates and validates an exact version-only server/web
candidate. It verifies the candidate identity, parent commit, synchronized release configuration, and exact set of
generated version mirrors. It then builds the production image, starts it against Postgres, and verifies readiness and
the served web application.

Affected pull requests already own unit and integration tests, generated API and deploy contracts,
database upgrade/rollback rehearsal, and production-image scanning. The release cut deliberately does not rerun them.
Successful metadata and container smoke validation opens and atomically merges the version-only PR before the prepared
release is tagged and its image is published. The same release commit is then published to the Expo internal channel
without waiting for self-host deployment when its manifest's native-build tag exists. A reserved but unpublished
native tag skips OTA without failing the server/image release. Production OTA publishing remains held behind the
protected production environment approval.

## Performance and owner judgment

Synthetic LCP, CLS, and INP measurements do not run in GitHub Actions because shared-runner timing is not a useful
release signal for this deployment. Bundle and backend microbenchmarks also remain local diagnostics rather than
automatic gates. Use `npm.cmd run test:performance:web`, `npm.cmd run performance:bundle`, or
`npm.cmd --prefix backend run performance:regression` when investigating a concrete performance concern; production
field aggregates remain the operational signal.

Physical-device, store-console, staging-alert, dogfood, legal, and final rollout checks are likewise selected by the
owner when the release context warrants them. No repository engine converts those decisions into an evidence commit
or blocks a release on a receipt ledger.

Useful policy checks while changing the release machinery are:

```powershell
npm.cmd run release:acceptance
npm.cmd run test:release
```
