# Self-hosted observability

Calibrate diagnostics are local, bounded, and disabled by default. Enabling them does not configure or contact an
external logging, analytics, crash-reporting, or metrics service. Operators decide whether stdout is retained and
whether the aggregate metrics endpoint is reachable through their reverse proxy.

## Structured request logs

Set `CALIBRATE_DIAGNOSTICS_ENABLED=true` to write newline-delimited JSON events for startup, reminder-job completion,
and HTTP request completion. Every request receives `x-request-id` and `x-correlation-id` response headers whether
diagnostics are enabled or not. A caller may supply either header only as an opaque 16-64 character hexadecimal trace
ID or RFC 4122 UUID; malformed or prose-like values are replaced with a random UUID.

HTTP events contain only request/correlation IDs, method, a fixed low-cardinality category, response status,
success/failure outcome, and elapsed milliseconds. They never contain the URL, route parameters, query string,
request/response body, cookies, authorization headers, email, user/device IDs, food names, barcodes, weights, calories,
provider results, or tokens. The category allowlist is `auth`, `provider`, `notification`, `sync`,
`watch_reconciliation`, `activity_reconciliation`, `health`, `diagnostics`, `api_other`, and `frontend`.

Unexpected request and reminder-job errors log an error type/request ID rather than serializing the thrown error,
because database/provider messages can contain request-derived values.

## Aggregate metrics

Set both variables to expose process-local JSON counters:

```dotenv
CALIBRATE_DIAGNOSTICS_ENABLED=true
CALIBRATE_DIAGNOSTICS_METRICS_TOKEN=<random value of at least 32 characters>
```

Then request `GET /internal/diagnostics/metrics` with `Authorization: Bearer <token>`. The endpoint returns 404 unless
fully configured, 401 for a missing/incorrect token, and `Cache-Control: no-store` on success. Keep the path private at
the reverse proxy where practical, and never place its token in frontend code or a browser-visible environment value.

Counters reset on process restart and include only total/4xx/5xx request counts, duration totals/max/fixed buckets,
the same aggregates for fixed categories, reminder-scheduler run outcomes/durations, and fixed-name operation
aggregates. Operation counters cover notification delivery, mobile token refresh, individual food-provider attempts,
Health Connect ingestion, and watch mutation reconciliation. Their fixed outcomes are success, failure, rejected,
conflict, and empty; duration totals/max/fixed buckets make upstream and reconciliation latency visible.
Untimed operations still contribute outcome counters but leave `durationSamples` and latency buckets unchanged.

There are no user, device, URL, route-parameter, provider-name, food, barcode, token, or health-value labels. In
particular, provider attempts are aggregated across the configured provider chain and Health Connect counters do not
include record types, counts, sources, or ingested values. Detailed vendor payload tracing remains out of scope.

Operationally, search logs by `request_id`, alert on rising category/server failures, and alert if
`background_jobs.reminder_scheduler.lastFinishedAt` stops advancing beyond the configured interval. Rotate the
diagnostics token like any operational secret and restart the backend after changing it.
