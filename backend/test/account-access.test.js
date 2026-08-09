const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CURRENT_ACCOUNT_ACCESS_WHERE,
  serializeAccountAccess
} = require('../src/utils/accountAccessSerialization');

const currentAcceptance = {
  terms_version: '2026-08-09',
  privacy_version: '2026-07-24',
  accepted_at: new Date('2026-08-09T00:00:00.000Z')
};

test('account access prioritizes email verification before legal acceptance', () => {
  assert.deepEqual(
    serializeAccountAccess({ email_verified_at: null, legal_acceptances: [currentAcceptance] }),
    { state: 'email_verification_required', email_verified: false, legal_current: true }
  );
});

test('account access requires current legal versions after verification', () => {
  assert.deepEqual(
    serializeAccountAccess({ email_verified_at: new Date(), legal_acceptances: [] }),
    { state: 'legal_acceptance_required', email_verified: true, legal_current: false }
  );
});

test('account access is full only when verification and current consent are present', () => {
  assert.deepEqual(
    serializeAccountAccess({ email_verified_at: new Date(), legal_acceptances: [currentAcceptance] }),
    { state: 'full', email_verified: true, legal_current: true }
  );
  assert.deepEqual(serializeAccountAccess({}), {
    state: 'full',
    email_verified: true,
    legal_current: true
  });
});
test('background jobs use the current verification and legal acceptance boundary', () => {
  assert.deepEqual(CURRENT_ACCOUNT_ACCESS_WHERE, {
    email_verified_at: { not: null },
    legal_acceptances: {
      some: {
        terms_version: '2026-08-09',
        privacy_version: '2026-07-24'
      }
    }
  });
});
