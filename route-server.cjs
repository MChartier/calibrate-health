// Synthetic persistence adapter around the actual selected source's metric route.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const source = path.resolve(process.argv[2]);
const port = Number(process.argv[3]);
const NativeDate = Date;
global.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-07-21T19:00:00Z'])); }
  static now() { return NativeDate.parse('2026-07-21T19:00:00Z'); }
};
const sourceRequire = createRequire(path.join(source, 'backend/test/routes-metrics.test.js'));
const fixtureText = fs.readFileSync(path.resolve(__dirname, '../goal-446/backend/test/routes-metrics.test.js'), 'utf8');
const fixtureRequire = Object.assign(name => name === 'node:test' ? (() => {}) : sourceRequire(name), sourceRequire);
const context = { require: fixtureRequire,
  module: { exports: {} }, console, Date, structuredClone };
vm.runInNewContext(fixtureText + '\nmodule.exports = { baselineFixture };', context);
const fixture = context.module.exports.baselineFixture({ timeZone: 'America/Los_Angeles' });
http.createServer(async (req, res) => {
  try {
    let result;
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      result = await fixture.save(JSON.parse(body), {}, req.headers['x-client-operation-id']);
    } else if (req.url === '/goals') {
      const goal = fixture.goal;
      result = { statusCode: 200, body: { ...goal, start_weight: goal.start_weight_grams / 1000,
        target_weight: goal.target_weight_grams / 1000, plan_status: 'available', plan_reason_code: null,
        projection: { status: 'projected', projected_end_date: '2027-02-01', reason_code: null } } };
    } else {
      const metric = fixture.metric;
      result = { statusCode: 200, body: metric ? [{ ...metric, weight: metric.weight_grams / 1000 }] : [] };
    }
    res.writeHead(result.statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (error) { res.writeHead(500); res.end(String(error.stack)); }
}).listen(port, '127.0.0.1', () => console.log(`Actual route fixture ${source} on ${port}`));
