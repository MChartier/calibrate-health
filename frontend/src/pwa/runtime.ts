import { useSyncExternalStore } from 'react';

export type PwaRuntimeState = {
    updateAvailable: boolean;
    updateServiceWorker: (() => Promise<void>) | null;
};

const DEFAULT_PWA_RUNTIME_STATE: PwaRuntimeState = {
    updateAvailable: false,
    updateServiceWorker: null
};

let pwaRuntimeState = DEFAULT_PWA_RUNTIME_STATE;
const listeners = new Set<() => void>();

/**
 * Publish service-worker lifecycle state from app boot code into React UI.
 */
export function publishPwaRuntimeState(nextState: Partial<PwaRuntimeState>) {
    pwaRuntimeState = {
        ...pwaRuntimeState,
        ...nextState
    };

    for (const listener of listeners) {
        listener();
    }
}

function subscribeToPwaRuntimeState(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getPwaRuntimeStateSnapshot(): PwaRuntimeState {
    return pwaRuntimeState;
}

/**
 * Subscribe React components to PWA runtime changes without coupling them to service-worker setup.
 */
export function usePwaRuntimeState(): PwaRuntimeState {
    return useSyncExternalStore(
        subscribeToPwaRuntimeState,
        getPwaRuntimeStateSnapshot,
        getPwaRuntimeStateSnapshot
    );
}
