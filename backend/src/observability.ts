import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

// Accept only opaque trace-style IDs so caller-controlled prose or health values cannot enter logs.
const REQUEST_ID_PATTERN = /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;
const FORBIDDEN_FIELD_PATTERN = /(authorization|cookie|token|secret|password|email|user_?id|payload|query|body|food|weight|calorie|barcode)/i;
const ERROR_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const ERROR_CONTEXT_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const LATENCY_BUCKETS_MS = [10, 50, 100, 500, 1_000, 5_000] as const;

export type DiagnosticCategory =
  | 'auth'
  | 'provider'
  | 'notification'
  | 'sync'
  | 'watch_reconciliation'
  | 'activity_reconciliation'
  | 'health'
  | 'diagnostics'
  | 'api_other'
  | 'frontend';

export type DiagnosticJobName = 'reminder_scheduler';
export type DiagnosticJobOutcome = 'success' | 'failure' | 'skipped';
export type DiagnosticOperationName = 'notification_delivery';
export type DiagnosticOperationOutcome = 'success' | 'failure';

export type ObservabilityConfig = {
  enabled: boolean;
  metricsEnabled: boolean;
  metricsToken: string | null;
};

type RequestCounters = {
  total: number;
  failures: number;
  serverFailures: number;
  durationMsTotal: number;
  durationMsMax: number;
  latencyBuckets: Record<string, number>;
};

type JobCounters = {
  runs: number;
  successes: number;
  failures: number;
  skipped: number;
  durationMsTotal: number;
  durationMsMax: number;
  lastOutcome: DiagnosticJobOutcome | null;
  lastFinishedAt: string | null;
};

const emptyRequestCounters = (): RequestCounters => ({
  total: 0,
  failures: 0,
  serverFailures: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  latencyBuckets: Object.fromEntries([...LATENCY_BUCKETS_MS.map((bucket) => [`up_to_${bucket}`, 0]), ['overflow', 0]])
});

const emptyJobCounters = (): JobCounters => ({
  runs: 0,
  successes: 0,
  failures: 0,
  skipped: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  lastOutcome: null,
  lastFinishedAt: null
});

/** Process-local, bounded counters deliberately avoid user, route-parameter, and health-data labels. */
export class DiagnosticsRegistry {
  private readonly startedAt = new Date();
  private readonly requests = emptyRequestCounters();
  private readonly requestCategories = new Map<DiagnosticCategory, RequestCounters>();
  private readonly jobs = new Map<DiagnosticJobName, JobCounters>();
  private readonly operations = new Map<DiagnosticOperationName, { attempts: number; successes: number; failures: number }>();

  recordRequest(category: DiagnosticCategory, statusCode: number, durationMs: number): void {
    this.updateRequestCounters(this.requests, statusCode, durationMs);
    const counters = this.requestCategories.get(category) ?? emptyRequestCounters();
    this.updateRequestCounters(counters, statusCode, durationMs);
    this.requestCategories.set(category, counters);
  }

  recordJob(name: DiagnosticJobName, outcome: DiagnosticJobOutcome, durationMs: number): void {
    const counters = this.jobs.get(name) ?? emptyJobCounters();
    counters.runs += 1;
    counters.successes += outcome === 'success' ? 1 : 0;
    counters.failures += outcome === 'failure' ? 1 : 0;
    counters.skipped += outcome === 'skipped' ? 1 : 0;
    counters.durationMsTotal += boundedDuration(durationMs);
    counters.durationMsMax = Math.max(counters.durationMsMax, boundedDuration(durationMs));
    counters.lastOutcome = outcome;
    counters.lastFinishedAt = new Date().toISOString();
    this.jobs.set(name, counters);
  }

  recordOperation(name: DiagnosticOperationName, outcome: DiagnosticOperationOutcome): void {
    const counters = this.operations.get(name) ?? { attempts: 0, successes: 0, failures: 0 };
    counters.attempts += 1;
    counters.successes += outcome === 'success' ? 1 : 0;
    counters.failures += outcome === 'failure' ? 1 : 0;
    this.operations.set(name, counters);
  }

  snapshot(): object {
    return {
      schema_version: 1,
      process_started_at: this.startedAt.toISOString(),
      process_uptime_seconds: Math.floor(process.uptime()),
      requests: {
        ...copyRequestCounters(this.requests),
        by_category: Object.fromEntries(
          [...this.requestCategories.entries()].sort(([left], [right]) => left.localeCompare(right))
            .map(([category, counters]) => [category, copyRequestCounters(counters)])
        )
      },
      background_jobs: Object.fromEntries(
        [...this.jobs.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([name, counters]) => [name, { ...counters }])
      ),
      operations: Object.fromEntries(
        [...this.operations.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([name, counters]) => [name, { ...counters }])
      )
    };
  }

  private updateRequestCounters(counters: RequestCounters, statusCode: number, durationMs: number): void {
    const bounded = boundedDuration(durationMs);
    counters.total += 1;
    counters.failures += statusCode >= 400 ? 1 : 0;
    counters.serverFailures += statusCode >= 500 ? 1 : 0;
    counters.durationMsTotal += bounded;
    counters.durationMsMax = Math.max(counters.durationMsMax, bounded);
    const bucket = LATENCY_BUCKETS_MS.find((limit) => bounded <= limit);
    counters.latencyBuckets[bucket === undefined ? 'overflow' : `up_to_${bucket}`] += 1;
  }
}

function boundedDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value * 100) / 100, 86_400_000);
}

function copyRequestCounters(counters: RequestCounters): object {
  return { ...counters, latencyBuckets: { ...counters.latencyBuckets } };
}

export const diagnosticsRegistry = new DiagnosticsRegistry();

export function resolveObservabilityConfig(env: NodeJS.ProcessEnv = process.env): ObservabilityConfig {
  const enabled = env.CALIBRATE_DIAGNOSTICS_ENABLED?.trim().toLowerCase() === 'true';
  const token = env.CALIBRATE_DIAGNOSTICS_METRICS_TOKEN?.trim() || null;
  return {
    enabled,
    metricsEnabled: enabled && token !== null && token.length >= 32,
    metricsToken: token
  };
}

export function classifyDiagnosticCategory(originalUrl: string): DiagnosticCategory {
  const path = originalUrl.split('?')[0]?.toLowerCase() ?? '';
  if (path.startsWith('/auth/')) return 'auth';
  const apiPath = path.replace(/^\/api(?:\/v1)?/, '');
  if (apiPath === '/healthz') return 'health';
  if (path === '/internal/diagnostics/metrics') return 'diagnostics';
  if (apiPath.startsWith('/watch')) return 'watch_reconciliation';
  if (apiPath.startsWith('/sync')) return 'sync';
  if (apiPath.startsWith('/activity')) return 'activity_reconciliation';
  if (apiPath.startsWith('/notifications')) return 'notification';
  if (apiPath.startsWith('/food/search') || apiPath.startsWith('/food/barcode') || apiPath.startsWith('/dev/food')) {
    return 'provider';
  }
  if (path.startsWith('/api/')) return 'api_other';
  return 'frontend';
}

export function safeRequestId(value: unknown, fallback: () => string = crypto.randomUUID): string {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (REQUEST_ID_PATTERN.test(normalized)) return normalized;
  }
  return fallback();
}

/** Return only a bounded class name; exception messages and stacks may contain credentials or health data. */
export function safeErrorType(error: unknown): string {
  const candidate = error instanceof Error ? error.name : '';
  return ERROR_TYPE_PATTERN.test(candidate) ? candidate : 'UnknownError';
}

/** Write a correlation-friendly operational error without serializing the exception itself. */
export function logSafeOperationalError(
  context: string,
  error: unknown,
  requestId?: unknown,
  write: (line: string) => void = console.error
): void {
  const safeContext = ERROR_CONTEXT_PATTERN.test(context) ? context : 'operation';
  const safeId = typeof requestId === 'string' && REQUEST_ID_PATTERN.test(requestId) ? requestId : 'unavailable';
  write(`${safeContext} failed (request_id=${safeId}, error_type=${safeErrorType(error)}).`);
}

function safeMethod(value: string): string {
  const normalized = value.toUpperCase();
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(normalized)
    ? normalized
    : 'OTHER';
}

type DiagnosticValue = string | number | boolean | null | undefined;

/** Defense-in-depth redaction for future structured fields; request/body/header objects are never accepted. */
export function sanitizeDiagnosticFields(fields: Record<string, DiagnosticValue>): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) continue;
    if (FORBIDDEN_FIELD_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    if (value === undefined) continue;
    if (typeof value === 'string') sanitized[key] = value.slice(0, 128);
    else if (typeof value === 'number') sanitized[key] = Number.isFinite(value) ? value : 0;
    else sanitized[key] = value;
  }
  return sanitized;
}

export function emitDiagnosticEvent(
  config: ObservabilityConfig,
  event: string,
  fields: Record<string, DiagnosticValue> = {},
  write: (line: string) => void = console.log
): void {
  if (!config.enabled) return;
  write(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'calibrate-backend',
    event: event.slice(0, 96),
    ...sanitizeDiagnosticFields(fields)
  }));
}

export function createRequestObservabilityMiddleware(options: {
  config: ObservabilityConfig;
  registry?: DiagnosticsRegistry;
  nowNs?: () => bigint;
  write?: (line: string) => void;
}): RequestHandler {
  const registry = options.registry ?? diagnosticsRegistry;
  const nowNs = options.nowNs ?? process.hrtime.bigint;
  return (req, res, next) => {
    const requestId = safeRequestId(req.get('x-request-id'));
    const correlationId = safeRequestId(req.get('x-correlation-id'), () => requestId);
    const category = classifyDiagnosticCategory(req.originalUrl || req.url);
    const startedAt = nowNs();
    res.locals.requestId = requestId;
    res.locals.correlationId = correlationId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);
    res.once('finish', () => {
      const durationMs = Number(nowNs() - startedAt) / 1_000_000;
      registry.recordRequest(category, res.statusCode, durationMs);
      emitDiagnosticEvent(options.config, 'http.request.completed', {
        request_id: requestId,
        correlation_id: correlationId,
        method: safeMethod(req.method),
        category,
        status_code: res.statusCode,
        duration_ms: boundedDuration(durationMs),
        outcome: res.statusCode >= 500 ? 'server_failure' : res.statusCode >= 400 ? 'client_failure' : 'success'
      }, options.write);
    });
    next();
  };
}

function metricsTokenMatches(header: string | undefined, configuredToken: string): boolean {
  const supplied = header?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(configuredToken);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createDiagnosticsMetricsHandler(options: {
  config: ObservabilityConfig;
  registry?: DiagnosticsRegistry;
}): RequestHandler {
  const registry = options.registry ?? diagnosticsRegistry;
  return (req, res) => {
    if (!options.config.metricsEnabled || !options.config.metricsToken) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (!metricsTokenMatches(req.get('authorization'), options.config.metricsToken)) {
      res.setHeader('www-authenticate', 'Bearer');
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    res.setHeader('cache-control', 'no-store');
    res.json(registry.snapshot());
  };
}
