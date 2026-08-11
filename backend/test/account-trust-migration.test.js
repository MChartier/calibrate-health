/**
 * Exercises account trust migration behavior and regression boundaries.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '../prisma/migrations/0035_account_verification_and_legal_consent/migration.sql');

test('account trust migration verifies existing users without inventing legal acceptance', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /ADD COLUMN "email_verified_at"/);
  assert.match(sql, /UPDATE "User" SET "email_verified_at" = "created_at"/);
  assert.match(sql, /CREATE TABLE "LegalAcceptance"/);
  assert.doesNotMatch(sql, /INSERT INTO "LegalAcceptance"/);
});

test('account trust migration stores only purpose-bound token hashes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /"purpose" "AccountTokenPurpose" NOT NULL/);
  assert.match(sql, /"token_hash" TEXT NOT NULL/);
  assert.doesNotMatch(sql, /"token" TEXT/);
  assert.match(sql, /ON DELETE CASCADE/);
});
