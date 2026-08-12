import { Linking } from 'react-native';
import { CameraView } from 'expo-camera';

export const cameraPermissionCopy = {
    blockedDescription: 'Camera access is blocked for Calibrate. Enable it from the app permissions screen.',
    blockedMessage: 'Camera access is blocked. Open device settings to enable it.',
    stillBlockedMessage: 'Camera access is still disabled in device settings.',
    settingsActionTitle: 'Open device settings',
    settingsActionHint: 'Opens the Calibrate app permissions in device settings.',
    openedSettingsMessage: 'After enabling Camera in device settings, return here and check access again.',
    openSettingsError: 'Unable to open device settings. Open the Calibrate app permissions manually.'
} as const;

export async function isBarcodeCameraAvailable(): Promise<boolean> {
    try {
        return await CameraView.isAvailableAsync();
    } catch {
        return false;
    }
}

export async function openBarcodeCameraSettings(): Promise<boolean> {
    try {
        await Linking.openSettings();
        return true;
    } catch {
        return false;
    }
}
