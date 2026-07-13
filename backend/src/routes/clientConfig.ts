import express from 'express';

const router = express.Router();

const CLIENT_API_VERSION = 1;
const DEFAULT_SERVER_VERSION = '1.0.0';
const HOSTED_ORIGIN = 'https://calibratehealth.app';
const MIN_SUPPORTED_MOBILE_VERSION = '0.1.0';
const CURRENT_API_VERSION = 'v1';

/**
 * Lightweight capability document for native clients and self-hosted deployments.
 */
router.get('/', (_req, res) => {
  res.json({
    api_version: CLIENT_API_VERSION,
    api_versions: {
      current: CURRENT_API_VERSION,
      supported: [CURRENT_API_VERSION],
      legacy_alias: '/api',
      legacy_deprecation: 'Supported until released clients have migrated to /api/v1.'
    },
    server_version: process.env.npm_package_version || DEFAULT_SERVER_VERSION,
    hosted_origin: HOSTED_ORIGIN,
    min_supported_mobile_version: MIN_SUPPORTED_MOBILE_VERSION,
    capabilities: {
      self_hosted_server_url: true,
      native_push: true,
      wear_os_ready: false
    }
  });
});

export default router;
