import { DEFAULT_HEALTH_CONNECT_SELECTION } from './types';
import { getHealthConnectOnboardingState } from './onboardingState';

describe('Health Connect onboarding state', () => {
    it('requires a permission review when Android grants only some selected data', () => {
        const state = getHealthConnectOnboardingState({
            availability: 'available',
            connected: true,
            error: null,
            isLoading: false,
            selection: DEFAULT_HEALTH_CONNECT_SELECTION,
            grantedFeatures: ['steps'],
            syncError: 'Health Connect access is missing.'
        });

        expect(state.needsPermissionReview).toBe(true);
        expect(state.missingFeatures).toEqual(['active_calories', 'total_calories', 'exercise']);
        expect(state.status).toBe('3 selected data types still need access.');
        expect(state.canRetrySync).toBe(false);
    });

    it('reports connected only after every selected permission is granted', () => {
        const state = getHealthConnectOnboardingState({
            availability: 'available',
            connected: true,
            error: null,
            isLoading: false,
            selection: DEFAULT_HEALTH_CONNECT_SELECTION,
            grantedFeatures: ['steps', 'active_calories', 'total_calories', 'exercise'],
            syncError: null
        });

        expect(state.needsPermissionReview).toBe(false);
        expect(state.status).toContain('connected');
    });
});
