import express from 'express';
import release from '../../../shared/release.json';
import { NATIVE_PUSH_MODES, resolveNativePushMode } from '../config/nativePush';

const router = express.Router();

const CLIENT_API_VERSION = 1;
const HOSTED_ORIGIN = 'https://calibratehealth.app';
const CURRENT_API_VERSION = release.server.api.current;

/**
 * Lightweight capability document for native clients and self-hosted deployments.
 */
router.get('/', (_req, res) => {
  const nativePushMode = resolveNativePushMode();
  res.json({
    api_version: CLIENT_API_VERSION,
    api_versions: {
      current: CURRENT_API_VERSION,
      supported: release.server.api.supported,
      legacy_alias: release.server.api.legacy_alias,
      legacy_deprecation: 'Supported until released clients have migrated to /api/v1.'
    },
    server_version: process.env.npm_package_version || release.server.version,
    hosted_origin: HOSTED_ORIGIN,
    min_supported_mobile_version: release.android.mobile.minimum_supported_version,
    min_supported_wear_version: release.android.wear.minimum_supported_version,
    capabilities: {
      self_hosted_server_url: true,
      native_push: nativePushMode === NATIVE_PUSH_MODES.EXPO,
      health_connect_activity: true,
      wear_os_ready: false
    }
  });
});

export default router;
