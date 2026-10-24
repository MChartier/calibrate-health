# ADR 0008: Tagged release commits

Status: superseded by the fixed three-path release workflow.

Application PRs leave release metadata unchanged. The protected workflow automatically chooses server patch and mobile major/minor/patch versions, reserves immutable Git tags and stamps a detached child build commit. It does not open or merge version PRs or update the default branch. Target baselines advance only after successful operations. See [the release runbook](../native-store-release.md).
