const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createAuthRateLimiters } = require('../src/middleware/security');

test('auth rate limiting is narrow and returns a JSON 429 response', async (t) => {
  const app = express();
  const limiters = createAuthRateLimiters();
  app.post('/register', limiters.registration, (_req, res) => res.json({ ok: true }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
    const response = await fetch(`${origin}/register`, { method: 'POST' });
    assert.equal(response.status, 200);
  }

  const limited = await fetch(`${origin}/register`, { method: 'POST' });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { message: 'Too many registration attempts. Try again later.' });

  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
});
