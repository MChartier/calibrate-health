export {};

declare global {
    interface Navigator {
        setAppBadge?: (count?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
    }

    interface ServiceWorkerRegistration {
        setAppBadge?: (count?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
    }
}
