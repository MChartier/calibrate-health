import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core';
import { confirmDiscardChanges } from '../components/confirmDiscardChanges';
import { useBrowserDiscardNavigation } from './useBrowserDiscardNavigation';

type Navigate = () => void;

/**
 * Preserves a routed editor's unsaved-change confirmation for shell, browser,
 * gesture, and in-page navigation.
 */
export function useConfirmDiscardNavigation(isDirty: boolean, isNavigationBlocked = false) {
    const navigation = useNavigation();
    const confirmationPendingRef = useRef(false);
    const pendingNavigationRef = useRef<Navigate | null>(null);
    const [navigationAllowed, setNavigationAllowed] = useState(false);
    const shouldPreventRemoval = (isDirty || isNavigationBlocked) && !navigationAllowed;

    const allowNavigation = useCallback((navigate: Navigate) => {
        pendingNavigationRef.current = navigate;
        setNavigationAllowed(true);
    }, []);

    useEffect(() => {
        if (!navigationAllowed) return;
        const navigate = pendingNavigationRef.current;
        pendingNavigationRef.current = null;
        navigate?.();
    }, [navigationAllowed]);

    const requestNavigation = useCallback(async (navigate: Navigate) => {
        if (isNavigationBlocked || confirmationPendingRef.current) return;
        if (!isDirty) {
            allowNavigation(navigate);
            return;
        }

        confirmationPendingRef.current = true;
        try {
            if (await confirmDiscardChanges()) allowNavigation(navigate);
        } finally {
            confirmationPendingRef.current = false;
        }
    }, [allowNavigation, isDirty, isNavigationBlocked]);

    useBrowserDiscardNavigation(shouldPreventRemoval, requestNavigation);

    usePreventRemove(shouldPreventRemoval, ({ data }) => {
        if (isNavigationBlocked || confirmationPendingRef.current) return;
        confirmationPendingRef.current = true;
        void confirmDiscardChanges()
            .then((confirmed) => {
                if (!confirmed) return;
                allowNavigation(() => navigation.dispatch(data.action));
            })
            .finally(() => {
                confirmationPendingRef.current = false;
            });
    });

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || !shouldPreventRemoval) return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [shouldPreventRemoval]);

    return { allowNavigation, requestNavigation };
}
