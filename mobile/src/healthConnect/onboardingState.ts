import type {
    HealthConnectAvailability,
    HealthConnectFeature,
    HealthConnectFeatureSelection
} from './types';

type HealthConnectOnboardingStateInput = {
    availability: HealthConnectAvailability | undefined;
    connected: boolean;
    error: string | null;
    isLoading: boolean;
    selection: HealthConnectFeatureSelection;
    grantedFeatures: HealthConnectFeature[];
    syncError: string | null;
};

export type HealthConnectOnboardingState = {
    canRetrySync: boolean;
    isAvailable: boolean;
    missingFeatures: HealthConnectFeature[];
    needsPermissionReview: boolean;
    status: string;
};

/** Summarizes connection state without treating partial Android permissions as a successful setup. */
export function getHealthConnectOnboardingState(
    input: HealthConnectOnboardingStateInput
): HealthConnectOnboardingState {
    const isAvailable = input.availability === 'available';
    const granted = new Set(input.grantedFeatures);
    const missingFeatures = (Object.entries(input.selection) as Array<[HealthConnectFeature, boolean]>)
        .filter(([feature, enabled]) => enabled && !granted.has(feature))
        .map(([feature]) => feature);
    const needsPermissionReview = isAvailable && (!input.connected || missingFeatures.length > 0);

    let status = 'Checking Health Connect availability...';
    if (!input.isLoading) {
        if (input.error) {
            status = input.error;
        } else if (input.connected && missingFeatures.length > 0) {
            status = `${missingFeatures.length} selected data type${missingFeatures.length === 1 ? '' : 's'} still need access.`;
        } else if (input.connected && input.syncError) {
            status = input.syncError;
        } else if (input.connected) {
            status = 'Health Connect is connected. Calibrate can import your selected activity data.';
        } else {
            switch (input.availability) {
                case 'available':
                    status = 'Health Connect is ready to connect.';
                    break;
                case 'provider_update_required':
                    status = 'Health Connect must be updated before it can connect.';
                    break;
                case 'not_android':
                    status = 'Health Connect is available only on supported Android devices.';
                    break;
                default:
                    status = 'Health Connect is not available on this device.';
            }
        }
    }

    return {
        canRetrySync: input.connected && missingFeatures.length === 0 && Boolean(input.syncError),
        isAvailable,
        missingFeatures,
        needsPermissionReview,
        status
    };
}
