const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EMAIL_DELIVERY_MODES,
  isEmailVerificationRequired,
  resolveEmailDeliveryConfig
} = require('../src/config/emailDelivery');
const { buildAccountEmailMessage } = require('../src/services/accountEmail');

test('hosted deployed registration requires configured account email', () => {
  const config = resolveEmailDeliveryConfig({
    NODE_ENV: 'production',
    CALIBRATE_HOSTED_SERVICE: 'true',
    EMAIL_DELIVERY_MODE: 'disabled'
  });
  assert.equal(config.mode, EMAIL_DELIVERY_MODES.DISABLED);
  assert.equal(config.hostedRequired, true);
  assert.equal(isEmailVerificationRequired(config), true);
});

test('self-hosted deployments may preserve registration without SMTP', () => {
  const config = resolveEmailDeliveryConfig({ NODE_ENV: 'production' });
  assert.equal(config.mode, EMAIL_DELIVERY_MODES.DISABLED);
  assert.equal(config.hostedRequired, false);
  assert.equal(isEmailVerificationRequired(config), false);
});

test('SMTP configuration requires a complete provider-neutral transport', () => {
  const config = resolveEmailDeliveryConfig({
    NODE_ENV: 'production',
    EMAIL_DELIVERY_MODE: 'smtp',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USERNAME: 'account',
    SMTP_PASSWORD: 'secret',
    SMTP_FROM: 'Calibrate <no-reply@example.test>',
    PUBLIC_APP_ORIGIN: 'https://app.example.test/path'
  });
  assert.equal(config.mode, EMAIL_DELIVERY_MODES.SMTP);
  assert.equal(config.publicAppOrigin, 'https://app.example.test');
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
});

test('account links keep credentials out of query strings and referrers', () => {
  const config = {
    mode: 'smtp',
    hostedRequired: true,
    publicAppOrigin: 'https://calibratehealth.app',
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    username: null,
    password: null,
    from: 'no-reply@example.test'
  };
  const message = buildAccountEmailMessage({
    kind: 'email_verification',
    recipient: 'private@example.test',
    token: 'opaque+/token'
  }, config);
  assert.match(message.text, /\/verify-email#token=opaque%2B%2Ftoken/);
  assert.doesNotMatch(message.text, /\?token=/);
});
