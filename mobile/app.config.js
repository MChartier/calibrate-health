const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Add EAS Update configuration only when a project ID is supplied. This keeps
 * normal web development usable while making release builds explicit and reproducible.
 */
function createExpoConfig({ config }, environment = process.env) {
  const iosRelease = require('../shared/ios-release.json');
  const otaRuntime = environment.CALIBRATE_IOS_OTA_RUNTIME;
  const androidOtaRuntime = environment.CALIBRATE_ANDROID_OTA_RUNTIME;
  if (androidOtaRuntime) {
    if (!/^\d+\.\d+\.\d+$/.test(androidOtaRuntime) || environment.CALIBRATE_ANDROID_OTA_EXPORT !== '1' ||
        environment.EAS_BUILD === 'true' || otaRuntime) {
      throw new Error('An Android OTA runtime override is only valid during a verified OTA export, never a native build.');
    }
    config = { ...config, version: androidOtaRuntime };
  }
  let iosVersion = iosRelease.version;
  let iosBuildNumber = iosRelease.buildNumber;
  if (otaRuntime) {
    const match = /^ios-(\d+\.\d+\.\d+)-([1-9]\d*)$/.exec(otaRuntime);
    if (!match || environment.CALIBRATE_IOS_OTA_EXPORT !== '1' || environment.EAS_BUILD === 'true') {
      throw new Error('An iOS OTA runtime override is only valid during a verified OTA export, never a native build.');
    }
    [, iosVersion, iosBuildNumber] = match;
  }
  if (config.ios) config = { ...config, ios: { ...config.ios, buildNumber: iosBuildNumber,
    runtimeVersion: `ios-${iosVersion}-${iosBuildNumber}` } };
  if (environment.EAS_BUILD_PLATFORM === 'ios' || environment.CALIBRATE_NATIVE_PLATFORM === 'ios' || otaRuntime) {
    config = { ...config, version: iosVersion };
  }
  if (environment.EAS_ACCOUNT) config = { ...config, owner: environment.EAS_ACCOUNT };
  const projectId = environment.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  if (!projectId) return config;
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be an Expo project UUID.');
  }

  const channel = environment.EXPO_UPDATES_CHANNEL?.trim() || 'internal';
  if (!CHANNEL_PATTERN.test(channel)) {
    throw new Error('EXPO_UPDATES_CHANNEL must contain only letters, numbers, dots, dashes, or underscores.');
  }

  return {
    ...config,
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      ...config.updates,
      url: `https://u.expo.dev/${projectId}`,
      requestHeaders: {
        ...config.updates?.requestHeaders,
        'expo-channel-name': channel
      }
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId
      }
    }
  };
}

module.exports = createExpoConfig;
module.exports.createExpoConfig = createExpoConfig;
