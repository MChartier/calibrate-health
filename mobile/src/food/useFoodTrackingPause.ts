import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useOfflineOutbox } from '../offline/provider';
import { createOutboxNamespace } from '../offline/queuedMutation';
import { applyQueuedPauseIntent } from './pendingPause';
import { foodTrackingPauseQueryKey } from './queryKeys';

export function useFoodTrackingPause(enabled = true) {
    const { api, user, serverUrl } = useAuth();
    const { mutations = [] } = useOfflineOutbox();
    const namespace = user && serverUrl ? createOutboxNamespace(serverUrl, user.id) : null;
    const query = useQuery({
        queryKey: foodTrackingPauseQueryKey,
        queryFn: () => api.getFoodTrackingPause(),
        enabled: enabled && Boolean(user)
    });
    const intent = applyQueuedPauseIntent(query.data?.pause, mutations, namespace);
    const hadQueuedIntent = useRef(intent.hasQueuedIntent);
    useEffect(() => {
        // Replay failure/discard also removes the overlay; recover canonical metadata in those cases.
        if (hadQueuedIntent.current && !intent.hasQueuedIntent && enabled && user) void query.refetch();
        hadQueuedIntent.current = intent.hasQueuedIntent;
    }, [intent.hasQueuedIntent, enabled, user, query.refetch]);
    return { ...query, data: intent.pause ? { pause: intent.pause } : query.data };
}
