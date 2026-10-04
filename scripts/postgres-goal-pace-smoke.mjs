#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { databaseUrlForSchema, migrateDeploy } from './postgres-populated-upgrade-smoke.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const backendRequire = createRequire(path.join(backend, 'package.json'));
const schema = 'calibrate_upgrade_smoke_goal_pace_' + crypto.randomBytes(8).toString('hex');
const rawUrl = process.env.DATABASE_URL;
assert.ok(rawUrl, 'DATABASE_URL is required; only a newly allocated smoke schema is modified.');
const { Client } = backendRequire('pg');
const admin = new Client({ connectionString: rawUrl });
let disconnectDatabase;
await admin.connect();
try {
    assert.match(schema, /^calibrate_upgrade_smoke_goal_pace_[a-f0-9]+$/);
    await admin.query('CREATE SCHEMA "' + schema + '"');
    const url = databaseUrlForSchema(rawUrl, schema);
    migrateDeploy(url, path.join(backend, 'prisma/schema.prisma'));
    process.env.DATABASE_URL = url;
    backendRequire('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true, compilerOptions: { module: 'commonjs' } });
    const database = backendRequire('./src/config/database');
    disconnectDatabase = database.disconnectDatabase;
    const db = database.default;
    const router = backendRequire('./src/routes/goals').default;
    const user = await db.user.create({ data: { email: 'pace-smoke@calibrate.invalid', password_hash: 'synthetic-only', timezone: 'UTC',
            date_of_birth: new Date('1990-01-01Z'), sex: 'MALE', height_mm: 1800, activity_level: 'MODERATE', weight_unit: 'KG', height_unit: 'CM' } });
    const goal = await db.goal.create({ data: { user_id: user.id, start_weight_grams: 90000, target_weight_grams: 75000,
            daily_deficit: 500, created_at: new Date('2025-01-01Z'), target_date: new Date('2027-02-01Z') } });
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    await db.bodyMetric.create({ data: { user_id: user.id, date: today, weight_grams: 85000 } });
    const day = await db.foodLogDay.create({ data: { user_id: user.id, local_date: today, status: 'COMPLETE', origin: 'USER',
            comparison_target_kcal: 2000, comparison_maintenance_kcal: 2500, comparison_captured_at: new Date() } });
    async function call(method, routePath, body = {}, operation = crypto.randomUUID()) {
        const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, set() { return this; }, json(data) { this.body = data; return this; } };
        const handler = router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route.stack[0].handle;
        await handler({ user, params: { id: String(goal.id) }, body, headers: { 'x-client-operation-id': operation } }, res);
        return res;
    }
    const preview = await call('get', '/pace-options');
    const payload = { daily_deficit: 250, expected_plan_version: preview.body.expected_plan_version };
    const operation = crypto.randomUUID();
    const first = await call('patch', '/:id/pace', payload, operation);
    assert.equal(first.statusCode, 200);
    assert.deepEqual((await call('patch', '/:id/pace', payload, operation)).body, first.body);
    assert.equal(await db.goal.count({ where: { user_id: user.id } }), 1);
    assert.equal(await db.caloriePlanRevision.count({ where: { user_id: user.id } }), 1);
    assert.deepEqual(await db.goal.findUnique({ where: { id: goal.id } }), goal);
    assert.deepEqual(await db.foodLogDay.findUnique({ where: { id: day.id } }), day);
    assert.equal(first.body.start_weight, 90);
    assert.equal(first.body.daily_deficit, 250);
    const next = await call('get', '/pace-options');
    const race = await Promise.all([500, 750].map(daily_deficit => call('patch', '/:id/pace', {
        daily_deficit, expected_plan_version: next.body.expected_plan_version
    })));
    assert.deepEqual(race.map(result => result.statusCode).sort(), [200, 409]);
    assert.equal(await db.caloriePlanRevision.count({ where: { user_id: user.id } }), 2);
    const newGoal = await call('post', '/', { start_weight: 85, target_weight: 75, daily_deficit: 250 });
    assert.equal(newGoal.statusCode, 200);
    assert.notEqual(newGoal.body.id, goal.id);
    assert.equal((await call('patch', '/:id/pace', payload)).statusCode, 409);
    assert.equal(await db.bodyMetric.count({ where: { user_id: user.id } }), 1);
    console.log('[goal-pace-smoke] PASS: real Postgres continuity, receipt replay, concurrent stale-editor rejection, immutable completed comparison and intentional new identity.');
}
finally {
    if (disconnectDatabase)
        await disconnectDatabase();
    if (/^calibrate_upgrade_smoke_goal_pace_[a-f0-9]+$/.test(schema))
        await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await admin.end();
    process.env.DATABASE_URL = rawUrl;
}
