import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';

import { foodTrackingPauseQueryKey } from './queryKeys';

export function useFoodTrackingPause(enabled = true) {
    const { api, user } = useAuth();
    return useQuery({
        queryKey: foodTrackingPauseQueryKey,
        queryFn: () => api.getFoodTrackingPause(),
        enabled: enabled && Boolean(user)
    });
}
