# Documentation

For local setup and common commands, start with the [repository README](../README.md).
Use current code, manifests, and workflow definitions for exact versions and executed check results.

## Product and data

- [Product scope](release-scope.md): supported workflows and deliberate limits
- [Plan check](calibration-insights.md) and [QA scenarios](calibration-insight-qa.md)
- [Weight-trend model](weight-trend-model.md): math, persistence, rollback, and tuning
- [Health Connect](health-connect.md) and [nutrition-label scanning](nutrition-label-scanning.md)
- [Account access and recovery](account-access-and-recovery.md)
- [API compatibility](api-versioning.md), [OpenAPI contract](openapi/v1.yaml), and [MCP](mcp.md)

## Development and validation

- [Testing and coverage](test-coverage.md): select checks for the changed surface
- [Dead-code checks](dead-code.md)
- [Expo web](expo-web.md) and [Android E2E](android-e2e.md)
- [Visual design](visual-design.md), [UX regression gates](ux-regression-gates.md), and
  [manual screen-reader checklist](accessibility/launch-20-screen-reader-checklist.md)

## Operations and releases

- [Self-hosting setup](../deploy/README.md) and [GitHub-driven deployment](../deploy/self-hosted/README.md)
- [Security model](security.md) and [Android/Wear threat review](security-release-threat-model.md)
- [Observability](observability.md) and [performance/operations runbook](performance-operations-runbook.md)
- [Database rollback rehearsal](database-rollback-rehearsal.md)
- [Server/native compatibility](release-compatibility.md) and [release acceptance](release-acceptance.md)
- [Local mobile releases](mobile-release.md), [internal Android setup](android-internal-testing.md),
  and [protected store releases](native-store-release.md)
- [Play and Health Apps checklist](play-console-health-release-checklist.md),
  [app links](android-app-links.md), and [optional physical Galaxy validation](physical-galaxy-validation.md)

## Historical context

[Architecture decisions](architecture/), [release records](releases/), and the
[September 12 PR review](pr-stack-review-2026-09-12.md) explain earlier decisions and evidence.
They are not proof that a current candidate has passed validation.
