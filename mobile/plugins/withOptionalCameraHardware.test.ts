const optionalCameraPlugin = require('./withOptionalCameraHardware') as {
    OPTIONAL_CAMERA_FEATURES: string[];
    applyOptionalCameraHardware: (manifest: any) => any;
};

describe('withOptionalCameraHardware config plugin', () => {
    it('marks all camera capabilities optional without duplicating generated features', () => {
        const manifest = {
            manifest: {
                'uses-feature': [
                    {
                        $: {
                            'android:name': 'android.hardware.camera',
                            'android:required': 'true'
                        }
                    }
                ]
            }
        };

        optionalCameraPlugin.applyOptionalCameraHardware(manifest);
        optionalCameraPlugin.applyOptionalCameraHardware(manifest);

        const cameraFeatures = manifest.manifest['uses-feature'].filter((entry: any) =>
            optionalCameraPlugin.OPTIONAL_CAMERA_FEATURES.includes(entry.$['android:name'])
        );
        expect(cameraFeatures).toHaveLength(optionalCameraPlugin.OPTIONAL_CAMERA_FEATURES.length);
        expect(cameraFeatures.map((entry: any) => entry.$['android:name']).sort())
            .toEqual([...optionalCameraPlugin.OPTIONAL_CAMERA_FEATURES].sort());
        expect(cameraFeatures.every((entry: any) => entry.$['android:required'] === 'false')).toBe(true);
    });

    it('preserves unrelated hardware declarations', () => {
        const manifest = {
            manifest: {
                'uses-feature': [{
                    $: {
                        'android:name': 'android.hardware.sensor.stepcounter',
                        'android:required': 'false'
                    }
                }]
            }
        };

        optionalCameraPlugin.applyOptionalCameraHardware(manifest);

        expect(manifest.manifest['uses-feature']).toContainEqual({
            $: {
                'android:name': 'android.hardware.sensor.stepcounter',
                'android:required': 'false'
            }
        });
    });
});
