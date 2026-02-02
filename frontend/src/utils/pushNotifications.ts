const SERVICE_WORKER_READY_TIMEOUT_MS = 5000; // Avoid hanging when no service worker is registered.

/**
 * Convert a base64 URL-safe VAPID key into a Uint8Array for PushManager.subscribe().
 */
export const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

/**
 * Prefer the registration that can immediately handle push events.
 */
const pickBestServiceWorkerRegistration = (
    registrations: readonly ServiceWorkerRegistration[]
): ServiceWorkerRegistration | null => {
    if (registrations.length === 0) {
        return null;
    }

    return (
        registrations.find((registration) => Boolean(registration.active)) ??
        registrations.find((registration) => Boolean(registration.waiting)) ??
        registrations.find((registration) => Boolean(registration.installing)) ??
        registrations[0]
    );
};

/**
 * Resolve the active service worker registration without hanging indefinitely.
 */
export const resolveServiceWorkerRegistration = async (
    timeoutMs: number = SERVICE_WORKER_READY_TIMEOUT_MS
): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const timeoutPromise = new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), timeoutMs);
        });

        const readyPromise = navigator.serviceWorker.ready as Promise<ServiceWorkerRegistration>;
        const registration = await Promise.race<ServiceWorkerRegistration | null>([readyPromise, timeoutPromise]);
        if (registration) {
            return registration;
        }

        const currentPageRegistration = await navigator.serviceWorker.getRegistration();
        if (currentPageRegistration) {
            return currentPageRegistration;
        }

        return pickBestServiceWorkerRegistration(await navigator.serviceWorker.getRegistrations());
    } catch (error) {
        console.error(error);
        return null;
    }
};
