const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  DiagnosticsRegistry,
  classifyDiagnosticCategory,
  createDiagnosticsMetricsHandler,
  createRequestObservabilityMiddleware,
  resolveObservabilityConfig,
  safeRequestId,
  sanitizeDiagnosticFields
} = require('../src/observability');

function mockResponse(statusCode = 200) {
  const response = new EventEmitter();
  response.locals = {};
  response.statusCode = statusCode;
  response.headers = new Map();
  response.setHeader = (name, value) => response.headers.set(name.toLowerCase(), value);
  response.status = (value) => { response.statusCode = value; return response; };
  response.json = (value) => { response.body = value; return response; };
  return response;
}

test('request observability emits bounded metadata without URL, query, headers, identity, or health payloads', () => {
  const registry = new DiagnosticsRegistry();
  const lines = [];
  const times = [1_000_000_000n, 1_125_000_000n];
  const middleware = createRequestObservabilityMiddleware({
    config: { enabled: true, metricsEnabled: false, metricsToken: null },
    registry,
    nowNs: () => times.shift(),
    write: (line) => lines.push(line)
  });
  const headers = {
    'x-request-id': '123e4567-e89b-42d3-a456-426614174000',
    authorization: 'Bearer secret-token',
    cookie: 'cal.sid=secret'
  };
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/watch/mutations?weight_grams=81234&food=private',
    url: '/api/v1/watch/mutations',
    body: { weight_grams: 81234 },
    get: (name) => headers[name.toLowerCase()]
  };
  const response = mockResponse(409);

  let nextCalled = false;
  middleware(request, response, () => { nextCalled = true; });
  response.emit('finish');

  assert.equal(nextCalled, true);
  assert.equal(response.headers.get('x-request-id'), '123e4567-e89b-42d3-a456-426614174000');
  const event = JSON.parse(lines[0]);
  assert.deepEqual(
    Object.keys(event).sort(),
    ['category', 'correlation_id', 'duration_ms', 'event', 'level', 'method', 'outcome', 'request_id', 'service', 'status_code', 'timestamp'].sort()
  );
  assert.equal(event.category, 'watch_reconciliation');
  assert.equal(event.duration_ms, 125);
  assert.equal(event.status_code, 409);
  assert.equal(lines[0].includes('81234'), false);
  assert.equal(lines[0].includes('secret-token'), false);
  assert.equal(lines[0].includes('private'), false);
  assert.equal(registry.snapshot().requests.by_category.watch_reconciliation.failures, 1);
});

test('request IDs, categories, and diagnostic fields are validated and redacted', () => {
  assert.equal(safeRequestId(' 0123456789abcdef ', () => 'fallback'), '0123456789abcdef');
  assert.equal(safeRequestId('bad id', () => 'fallback'), 'fallback');
  assert.equal(safeRequestId('myweight81234private', () => 'fallback'), 'fallback');
  assert.equal(classifyDiagnosticCategory('/auth/mobile/login'), 'auth');
  assert.equal(classifyDiagnosticCategory('/api/v1/food/search?q=oats'), 'provider');
  assert.equal(classifyDiagnosticCategory('/api/sync?cursor=private'), 'sync');
  assert.deepEqual(sanitizeDiagnosticFields({
    outcome: 'success',
    access_token: 'secret',
    weight_grams: 81234,
    invalidKey: 'dropped'
  }), {
    outcome: 'success',
    access_token: '[REDACTED]',
    weight_grams: '[REDACTED]'
  });
});

test('metrics surface is opt-in, bearer protected, and contains only bounded aggregate counters', () => {
  const token = 'a'.repeat(32);
  const config = resolveObservabilityConfig({
    CALIBRATE_DIAGNOSTICS_ENABLED: 'true',
    CALIBRATE_DIAGNOSTICS_METRICS_TOKEN: token
  });
  const registry = new DiagnosticsRegistry();
  registry.recordRequest('auth', 401, 25);
  registry.recordRequest('provider', 503, 250);
  registry.recordJob('reminder_scheduler', 'failure', 500);
  registry.recordOperation('notification_delivery', 'failure');
  const handler = createDiagnosticsMetricsHandler({ config, registry });

  const unauthorized = mockResponse();
  handler({ get: () => 'Bearer wrong' }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const authorized = mockResponse();
  handler({ get: (name) => name === 'authorization' ? `Bearer ${token}` : undefined }, authorized);
  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.headers.get('cache-control'), 'no-store');
  assert.equal(authorized.body.requests.total, 2);
  assert.equal(authorized.body.requests.serverFailures, 1);
  assert.equal(authorized.body.background_jobs.reminder_scheduler.failures, 1);
  assert.deepEqual(authorized.body.operations.notification_delivery, { attempts: 1, successes: 0, failures: 1 });
  const encoded = JSON.stringify(authorized.body);
  assert.equal(encoded.includes(token), false);
  assert.equal(encoded.includes('user'), false);

  const disabled = mockResponse();
  createDiagnosticsMetricsHandler({
    config: { enabled: false, metricsEnabled: false, metricsToken: null },
    registry
  })({ get: () => undefined }, disabled);
  assert.equal(disabled.statusCode, 404);
});
