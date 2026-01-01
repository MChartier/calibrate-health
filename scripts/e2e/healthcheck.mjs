/**
 * Simple E2E smoke check for a deployed environment.
 *
 * This is intentionally dependency-free so it can run in CI without `npm ci`.
 * It polls the API health endpoint until it returns `{ ok: true }` or times out.
 */

/**
 * Read a required environment variable.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Read an integer environment variable with a fallback.
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Env var ${name} must be a positive integer; got: ${raw}`);
  }
  return value;
}

/**
 * Sleep for the specified duration.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a fully-qualified health check URL from a base URL and a path.
 * @param {string} baseUrl
 * @param {string} path
 * @returns {URL}
 */
function buildHealthzUrl(baseUrl, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, baseUrl);
}

/**
 * Fetch JSON with a hard timeout.
 * @param {URL} url
 * @param {{ timeoutMs: number }} options
 * @returns {Promise<{ status: number, json: unknown }>}
 */
async function fetchJson(url, { timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const status = response.status;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const snippet = text ? ` Body: ${text.slice(0, 300)}` : '';
      throw new Error(`HTTP ${status}.${snippet}`);
    }

    const json = await response.json();
    return { status, json };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate the /api/healthz response payload.
 * @param {unknown} json
 */
function assertHealthzPayload(json) {
  if (!json || typeof json !== 'object') {
    throw new Error(`Expected JSON object response; got: ${typeof json}`);
  }

  // @ts-ignore - runtime shape check for a simple JSON payload.
  if (json.ok !== true) {
    throw new Error(`Expected response body to include {"ok": true}.`);
  }
}

/**
 * Poll /api/healthz until it passes or a deadline is reached.
 * @param {{
 *   baseUrl: string,
 *   healthzPath: string,
 *   pollTimeoutMs: number,
 *   pollIntervalMs: number,
 *   requestTimeoutMs: number,
 * }} options
 */
async function pollHealthz({
  baseUrl,
  healthzPath,
  pollTimeoutMs,
  pollIntervalMs,
  requestTimeoutMs
}) {
  const url = buildHealthzUrl(baseUrl, healthzPath);
  const deadlineMs = Date.now() + pollTimeoutMs;

  let attempt = 0;
  /** @type {unknown} */
  let lastError = null;

  while (Date.now() < deadlineMs) {
    attempt += 1;
    try {
      const { json } = await fetchJson(url, { timeoutMs: requestTimeoutMs });
      assertHealthzPayload(json);
      console.log(`Health check passed: ${url.toString()}`);
      return;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Health check not ready (attempt ${attempt}): ${message}`);
      await sleep(pollIntervalMs);
    }
  }

  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Health check failed after ${pollTimeoutMs}ms: ${url.toString()} (last error: ${lastMessage})`
  );
}

/**
 * CLI entrypoint for the staging smoke test.
 * @returns {Promise<void>}
 */
async function main() {
  const baseUrl = requireEnv('E2E_BASE_URL');

  const healthzPath = process.env.E2E_HEALTHZ_PATH ?? '/api/healthz';
  const pollTimeoutMs = readIntEnv('E2E_POLL_TIMEOUT_MS', 5 * 60 * 1000);
  const pollIntervalMs = readIntEnv('E2E_POLL_INTERVAL_MS', 5 * 1000);
  const requestTimeoutMs = readIntEnv('E2E_REQUEST_TIMEOUT_MS', 10 * 1000);

  await pollHealthz({
    baseUrl,
    healthzPath,
    pollTimeoutMs,
    pollIntervalMs,
    requestTimeoutMs
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
