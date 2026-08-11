/**
 * Provides Expo client behavior for query online manager.
 */
import React from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

type NativeNetworkState = Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>;

type NativeConnectivitySource = {
    addEventListener(listener: (state: NativeNetworkState) => void): () => void;
};

/** Determine whether the input conforms to the native network online contract. */
export function isNativeNetworkOnline(state: NativeNetworkState): boolean {
    return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Drive React Query from Android's connection and reachability transitions. */
export function configureQueryOnlineManager(
    source: NativeConnectivitySource = NetInfo
): () => void {
    let unsubscribe: () => void = () => undefined;
    let subscribed = false;
    const stop = () => {
        if (!subscribed) return;
        subscribed = false;
        unsubscribe();
    };

    onlineManager.setEventListener((setOnline) => {
        unsubscribe = source.addEventListener((state) => setOnline(isNativeNetworkOnline(state)));
        subscribed = true;
        return stop;
    });

    return () => {
        stop();
        onlineManager.setEventListener(() => () => undefined);
    };
}

/** Provide the query online manager React hook. */
export function useQueryOnlineManager(): void {
    React.useEffect(() => configureQueryOnlineManager(), []);
}