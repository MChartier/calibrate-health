/**
 * Provides Expo client behavior for use pending calibration evidence mutation.
 */
import { useOfflineOutbox } from './provider';
import { hasPendingCalibrationEvidenceMutation } from './pendingCalibrationEvidence';

/** Hide calibration actions until queued evidence writes replay and the server status refetches. */
export function usePendingCalibrationEvidenceMutation(): boolean {
    return hasPendingCalibrationEvidenceMutation(useOfflineOutbox().mutations);
}
