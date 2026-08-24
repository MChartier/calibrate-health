const { withAndroidManifest } = require('@expo/config-plugins');

const OPTIONAL_CAMERA_FEATURES = [
  'android.hardware.camera.any',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.flash',
];

/** Keep manual food entry available on tablets and other devices without camera hardware. */
function applyOptionalCameraHardware(androidManifest) {
  const features = androidManifest.manifest['uses-feature'] ?? [];

  for (const featureName of OPTIONAL_CAMERA_FEATURES) {
    const existing = features.find(
      (feature) => feature.$?.['android:name'] === featureName,
    );
    if (existing) {
      existing.$ = {
        ...existing.$,
        'android:required': 'false',
      };
    } else {
      features.push({
        $: {
          'android:name': featureName,
          'android:required': 'false',
        },
      });
    }
  }

  androidManifest.manifest['uses-feature'] = features;
  return androidManifest;
}

const withOptionalCameraHardware = (config) => withAndroidManifest(config, (manifestConfig) => {
  manifestConfig.modResults = applyOptionalCameraHardware(manifestConfig.modResults);
  return manifestConfig;
});

module.exports = withOptionalCameraHardware;
