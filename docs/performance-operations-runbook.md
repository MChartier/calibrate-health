# Performance and operations runbook

This contract turns Calibrate's bounded diagnostics into actionable dashboards and alerts without adding user-level telemetry. It applies to hosted and self-hosted deployments that explicitly enable diagnostics. Counters are process-local and reset on restart, so collectors must persist timestamped samples and evaluate deltas between consecutive samples with the same `process_started_at` value.

## Ownership

| Role | Owns |
| --- | --- |
| `service_operator` | Dashboard availability, metrics collection, first response, and synthetic alert smoke |
| `backend_maintainer` | 5xx, auth, provider, sync, notification delivery, and trend recompute remediation |
| `client_maintainer` | Onboarding and Core Web Vitals remediation |
| `release_engineer` | Release-version compatibility, bundle/benchmark baselines, rollout, and rollback |

Escalation starts with the dashboard's owner role. A second role is paged only when the runbook identifies its component. Do not put a person's name, email, user ID, provider name, raw URL, or health value in a label or alert.

## Sources and privacy boundary

- Poll authenticated, private `GET /internal/diagnostics/metrics` with the server-only diagnostics token and retain aggregate samples. Never expose the token to the client.
- Poll `GET /api/v1/client-config` for the running API and server versions. Compare them with the release annotation and `shared/release.json` used by the deployed client.
- Client diagnostics use only fixed operation, event, route, platform, version, outcome, and coarse duration-bucket values. Dashboards require the bounded joint tuple so an outcome remains attributable to its fixed operation and route. Separate marginal totals are not sufficient.
- Only authenticated feature and Core Web Vitals submissions enter alert-driving tuple aggregates. Anonymous root-render failures may still return a support correlation and write a bounded log event, but do not establish feature or performance alert volume.
- Never collect raw paths, URLs, messages, stack traces, exception text, identities, food/provider names, weights, calories, tokens, or request bodies.
- Treat a changed `process_started_at` as a counter reset, not a recovery or sudden negative rate.

## Dashboard contract

All rate panels use deltas over a rolling 10-minute window. Show volume beside every rate and suppress rate alerts below the stated minimum volume. Latency panels use bounded duration aggregates and buckets; they are operational signals, not percentile estimates.

| Panel | Aggregate | Required views |
| --- | --- | --- |
| HTTP 5xx | `requests.serverFailures`, `requests.total`, category deltas | Overall count/rate, top fixed category, process restarts |
| Authentication | `requests.by_category.auth`, `operations.auth_mobile_refresh` | 5xx rate, refresh failures, rejected refreshes shown separately |
| Food provider | `requests.by_category.provider`, `operations.food_provider_request` | Attempt failure/empty rates and latency buckets; no provider-name split |
| Sync/reconciliation | `requests.by_category.sync`, `activity_reconciliation`, `watch_reconciliation`; `health_connect_ingestion`, `watch_mutation_reconciliation` | Failures, conflicts, rejected operations, latency buckets |
| Notifications | `requests.by_category.notification`, `operations.notification_delivery`, `background_jobs.reminder_scheduler` | Terminal delivery outcomes after send and sent-date persistence, latency buckets, last job outcome and successful-finish age |
| Weight trend | `operations.weight_trend_recompute` | Failure/empty rates, duration average/max/buckets |
| Onboarding | joint client-diagnostic tuple for `onboarding_complete` | Failure count by fixed platform/version; route is `onboarding` |
| Web vitals | joint tuple for `largest_contentful_paint`, `interaction_to_next_paint`, `cumulative_layout_shift` | Good/needs-improvement/poor by fixed route and version. CLS uses outcome with `not_applicable` duration; LCP/INP also show coarse duration bucket |
| Release version | `/api/v1/client-config`, deployed release annotation | API/server/min-supported versions and incompatible-version count |

## Alert policy

Thresholds are evaluated from counter deltas, never cumulative process totals. Warning alerts open an incident for investigation; paging alerts require immediate mitigation.

| Code | Threshold over 10 minutes | Minimum volume | Severity | Owner |
| --- | --- | --- | --- | --- |
| `http_5xx_warning` | at least 5 5xx and rate >= 2% | 100 requests | warning | `service_operator` |
| `http_5xx_page` | at least 10 5xx and rate >= 5% | 100 requests | page | `service_operator` |
| `auth_request_failure_warning` | auth request 5xx >= 2% | 50 auth requests | warning | `backend_maintainer` |
| `auth_refresh_failure_warning` | mobile refresh failure >= 5% | 20 refresh attempts | warning | `backend_maintainer` |
| `provider_failure_warning` | provider operation failure >= 10% | 20 attempts | warning | `backend_maintainer` |
| `sync_failure_warning` | ingestion/reconciliation failure >= 5% | 20 attempts | warning | `backend_maintainer` |
| `notification_failure_page` | delivery failure >= 10% | 20 attempts | page | `backend_maintainer` |
| `reminder_scheduler_stale` | no successful finish for two configured intervals plus 5 minutes | one expected run | page | `service_operator` |
| `trend_failure_warning` | recompute failure >= 5% | 20 attempts | warning | `backend_maintainer` |
| `onboarding_failure_warning` | at least 5 operation failures | 5 failure reports | warning | `client_maintainer` |
| `web_vital_poor_warning` | poor outcome >= 10% for one operation/route/version | 50 samples | warning | `client_maintainer` |
| `release_version_mismatch` | runtime API/server version differs from release annotation or falls outside supported contract | one incompatible observation | page | `release_engineer` |

Normal authentication rejections, provider empty results, and expected sync conflicts remain visible but do not count as failures. Alert messages contain only alert code, owner role, severity, fixed dimensions, window, numerator, denominator, release version, and an opaque correlation ID.

## Response procedures

1. Confirm the alert from two consecutive samples and verify `process_started_at` did not change.
2. Check the release-version panel and deployment annotation. If the signal starts at a version boundary, stop or roll back the rollout under the `release_engineer` procedure.
3. Compare overall requests with the fixed category and operation panels. Use opaque request/correlation IDs to locate privacy-safe structured logs; do not enable payload logging.
4. For auth, separate server failures from normal rejected credentials or expired refresh tokens. For providers, inspect aggregate chain health without adding vendor labels. For sync, separate failure, rejected, and conflict outcomes.
5. For notification alerts, inspect delivery and scheduler panels together. A stale scheduler is an execution problem; delivery failures with healthy runs are a delivery-path problem.
6. For trend/onboarding/CWV alerts, reproduce with repository fixtures and focused gates before changing a budget. A budget change is not incident mitigation.
7. Record the fixed alert code, release version, start/end time, aggregate counts, action, and outcome. Do not copy user data or raw errors into the incident.

## Performance budget diagnostics

`quality/performance-budgets.json` is the reviewed diagnostic baseline. `node scripts/performance-budgets.mjs` measures exact level-9 gzip bytes for every safe hashed JavaScript file reachable from representative Expo route HTML, including named deferred chunks, and rejects growth above 5% when invoked. Expo route HTML can share one deferred graph; in that case each route value is deliberately the conservative total reachable graph, not a claim of route-specific chunk ownership. Because gzip output is runtime-dependent, use Node `24.14.0`, V8 `13.6.233.17-node.41`, zlib `1.3.1-e00f703`, `win32`, `x64` when comparing or updating this baseline.

API serialization and trend recompute use fixed fixtures, warmups, and the median of repeated same-process measurements. Their normalized median ratios reject regression above 10% when invoked. Use Node `24.14.0`, V8 `13.6.233.17-node.41`, `win32`, `x64` for comparable results. These bundle and backend measurements do not run automatically in GitHub Actions and do not gate pull requests or releases. Run them when investigating a concrete performance concern; they do not replace database, network, device, or production latency monitoring.

Baseline changes require a reviewed reference, one owner role above, date, and rationale. From a Windows x64 shell where `node -p "JSON.stringify({node:process.versions.node,v8:process.versions.v8,zlib:process.versions.zlib,platform:process.platform,arch:process.arch})"` matches the manifest's pinned identities, run:

```powershell
npm.cmd --prefix backend run performance:regression -- --update-baseline --review-reference=issue-301 --owner-role=release_engineer --reviewed-on=YYYY-MM-DD --rationale="Why this measured change is accepted"
npm.cmd run build:expo-web
node scripts/performance-budgets.mjs --update-baseline --review-reference=issue-301 --owner-role=release_engineer --reviewed-on=YYYY-MM-DD --rationale="Why this complete named-chunk graph change is accepted"
npm.cmd --prefix backend run performance:regression
npm.cmd run performance:bundle
```

The benchmark updater intentionally runs first and the route updater validates the complete manifest last. Review the manifest diff and rerun both gates without update flags. Never update a baseline merely to make a failing job green.

## Operational collector

Run exactly one collector for each backend process every 10 minutes. The collector polls the private aggregate metrics and public client-config surfaces, retains only fixed alert fields in a persistent state file, and rebaselines without alerting when samples arrive outside the 8-12 minute window or the backend process changes. All HTTP response bodies must complete within the collector's 15-second bound, below its 20-minute lock lease. The owner-token lock prevents concurrent sends and a stale collector cannot release its successor's lock. Before sending, the collector atomically persists the exact sanitized pending window, target environment, stable correlation ID, and idempotency keys; retries reuse that window and environment, and state advances only after every sink acknowledgement succeeds.

Required environment:

| Variable | Contract |
| --- | --- |
| `CALIBRATE_DIAGNOSTICS_METRICS_URL` | Absolute HTTPS `/internal/diagnostics/metrics` URL without query or credentials |
| `CALIBRATE_DIAGNOSTICS_METRICS_TOKEN` | Server-only metrics bearer token, at least 32 characters (matching the backend contract) |
| `CALIBRATE_CLIENT_CONFIG_URL` | Absolute HTTPS `/api/v1/client-config` URL |
| `CALIBRATE_EXPECTED_SERVER_VERSION` | Reviewed deployed server version such as `0.14.0` |
| `CALIBRATE_REMINDER_INTERVAL_MS` | Actual deployed scheduler interval in milliseconds |
| `CALIBRATE_ALERT_STATE_PATH` | Persistent, collector-owned state file; do not place it in a web-served directory |
| `CALIBRATE_ALERT_SINK_URL` | Absolute HTTPS alert receiver URL without query or credentials |
| `CALIBRATE_ALERT_SINK_TOKEN` | Alert receiver bearer token, at least 16 characters |
| `CALIBRATE_ALERT_ENVIRONMENT` | Exact fixed value `staging` or `production` |

The receiver accepts `POST { environment, idempotency_key, alert }`, honors the matching `Idempotency-Key` header, and returns a 2xx JSON acknowledgement `{ "accepted": true, "environment": "staging|production", "receipt_id": "<opaque UUID or 16-64 hex>" }`. It must not include payload, identity, path, URL, token, or health data in its acknowledgement or logs.

For a cron-owned staging collector:

```cron
*/10 * * * * cd /srv/calibrate && npm run operations:collect
```

The process supervisor must load the variables above and retain `CALIBRATE_ALERT_STATE_PATH` across collector invocations. Do not run overlapping cron and supervisor schedules against the same state file.

## Synthetic alert smoke

`npm run test:operations` keeps the deterministic in-memory smoke and focused collector tests network-free. After the staging collector and sink credentials are configured, execute the real transport smoke explicitly:

```powershell
$env:CALIBRATE_ALERT_ENVIRONMENT='staging'
$env:CALIBRATE_ALERT_SINK_URL='https://staging-alert-receiver.example/v1/alerts'
$env:CALIBRATE_ALERT_SINK_TOKEN='<staging-only-secret>'
npm.cmd run smoke:alerts:staging
```

The command refuses a non-staging environment and passes only when the receiver acknowledges the fixed privacy-safe provider-failure aggregate with a staging-tagged opaque receipt. It does not poll or mutate product data. Run it when validating a real staging alert path is useful; the result is an operational diagnostic, not an external-launch receipt or automatic release gate.
