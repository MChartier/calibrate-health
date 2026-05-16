import express from 'express';

const router = express.Router();

const CLIENT_API_VERSION = 1;
const DEFAULT_SERVER_VERSION = '1.0.0';
const HOSTED_ORIGIN = 'https://calibratehealth.app';
const MIN_SUPPORTED_MOBILE_VERSION = '0.1.0';

/**
 * Lightweight capability document for native clients and self-hosted deployments.
 */
router.get('/', (_req, res) => {
  res.json({
    api_version: CLIENT_API_VERSION,
    server_version: process.env.npm_package_version || DEFAULT_SERVER_VERSION,
    hosted_origin: HOSTED_ORIGIN,
    min_supported_mobile_version: MIN_SUPPORTED_MOBILE_VERSION,
    capabilities: {
      self_hosted_server_url: true,
      native_push: true,
      wear_os_ready: true
    }
  });
});

export default router;
