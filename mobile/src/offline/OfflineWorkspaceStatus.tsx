import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useOfflineOutbox } from './provider';
import { AppNotice } from '../components/AppNotice';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';

/** Local continuity is independent of permission to resume server synchronization. */
export function OfflineWorkspaceStatus() {
    const { user, serverUrl, pendingReconnection, recheckClientCompatibility } = useAuth();
    const { mutations, reconcile } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const [retrying, setRetrying] = useState(false);
    const scopeRef = useRef({ serverUrl, userId: user?.id });
    scopeRef.current = { serverUrl, userId: user?.id };
    const recoveryRef = useRef<() => void>(() => undefined);
    useEffect(() => {
        if (!user || !pendingReconnection) {
            setRetrying(false);
            return;
        }
        let active = true;
        let running = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const retry = async () => {
            if (!active || running || !onlineManager.isOnline() || AppState.currentState === 'background') return;
            running = true;
            setRetrying(true);
            if (timer) clearTimeout(timer);
            try {
                if (await recheckClientCompatibility()) {
                    if (scopeRef.current.serverUrl !== serverUrl || scopeRef.current.userId !== user.id) return;
                    await reconcile();
                    await queryClient.invalidateQueries();
                }
            } catch {
                // Unavailability preserves identity and queued writes; terminal rejection is handled by auth.
            } finally {
                running = false;
                if (active) {
                    setRetrying(false);
                    timer = setTimeout(() => void retry(), Math.min(60_000, 5_000 * 2 ** Math.min(attempts++, 4)));
                }
            }
        };
        recoveryRef.current = () => { void retry(); };
        timer = setTimeout(() => void retry(), 5_000);
        const unsubscribe = onlineManager.subscribe((online) => { if (online) void retry(); });
        const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void retry(); });
        return () => {
            active = false;
            if (timer) clearTimeout(timer);
            unsubscribe();
            subscription.remove();
            recoveryRef.current = () => undefined;
        };
    }, [serverUrl, pendingReconnection, queryClient, recheckClientCompatibility, reconcile, user?.id]);
    if (!user || (!pendingReconnection && mutations.length === 0)) return null;
    return <AppNotice accessibilityLiveRegion="polite" testID="offline-workspace-status">
        <AppText variant="card">{pendingReconnection ? 'Pending reconnection' : 'Changes pending sync'}</AppText>
        <AppText>Keep tracking on this device. {mutations.length} pending changes will sync after your connection and account access are verified.</AppText>
        {pendingReconnection ? <AppButton title={retrying ? 'Reconnecting...' : 'Retry connection'} disabled={retrying} onPress={() => recoveryRef.current()} /> : null}
    </AppNotice>;
}
