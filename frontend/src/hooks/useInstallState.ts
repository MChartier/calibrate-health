import { useCallback, useEffect, useMemo, useState } from 'react';

const IOS_USER_AGENT_REGEX = /iphone|ipad|ipod/i;
const NON_SAFARI_IOS_BROWSER_REGEX = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i;
const CHROMIUM_USER_AGENT_REGEX = /Chrome|Chromium|Edg|OPR|SamsungBrowser/i;

export type InstallPlatformHint = 'ios' | 'chromium' | 'other';
export type InstallPromptResult = 'accepted' | 'dismissed' | 'unavailable';

/**
 * iOS/iPadOS Safari supports the Add to Home Screen flow; other iOS browsers have weaker support.
 */
function isIosSafari(): boolean {
    if (typeof navigator === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    const isIos = IOS_USER_AGENT_REGEX.test(userAgent) || (userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
    if (!isIos) return false;
    if (!userAgent.includes('Safari')) return false;
    return !NON_SAFARI_IOS_BROWSER_REGEX.test(userAgent);
}

/**
 * Use browser display mode signals to detect whether this session is already running as an installed app.
 */
function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (window.navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Distinguish install-capable platforms so the navbar can render the correct CTA behavior.
 */
function resolveInstallPlatformHint(): InstallPlatformHint {
    if (isIosSafari()) return 'ios';
    if (typeof navigator === 'undefined') return 'other';
    const userAgent = navigator.userAgent || '';
    return CHROMIUM_USER_AGENT_REGEX.test(userAgent) ? 'chromium' : 'other';
}

/**
 * Track installability/runtime state and expose prompt actions for the navbar Install CTA.
 */
export function useInstallState() {
    const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const platformHint = useMemo(() => resolveInstallPlatformHint(), []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const mediaQuery = window.matchMedia('(display-mode: standalone)');
        const syncInstalledState = () => {
            setIsInstalled(isStandaloneDisplayMode());
        };

        const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
            event.preventDefault();
            setDeferredPrompt(event);
            syncInstalledState();
        };

        const handleAppInstalled = () => {
            setDeferredPrompt(null);
            setIsInstalled(true);
        };

        const supportsModernMediaQueryEvents = typeof mediaQuery.addEventListener === 'function';
        syncInstalledState();
        if (supportsModernMediaQueryEvents) {
            mediaQuery.addEventListener('change', syncInstalledState);
        } else {
            mediaQuery.addListener(syncInstalledState);
        }
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            if (supportsModernMediaQueryEvents) {
                mediaQuery.removeEventListener('change', syncInstalledState);
            } else {
                mediaQuery.removeListener(syncInstalledState);
            }
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const canInstallPrompt = Boolean(deferredPrompt) && !isInstalled;
    const showInstallCta = !isInstalled && (canInstallPrompt || platformHint === 'ios');

    const promptInstall = useCallback(async (): Promise<InstallPromptResult> => {
        if (!deferredPrompt || isInstalled) return 'unavailable';

        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            setDeferredPrompt(null);
            if (outcome === 'accepted') {
                setIsInstalled(true);
                return 'accepted';
            }
            return 'dismissed';
        } catch {
            setDeferredPrompt(null);
            return 'unavailable';
        }
    }, [deferredPrompt, isInstalled]);

    return {
        isInstalled,
        canInstallPrompt,
        platformHint,
        showInstallCta,
        promptInstall
    };
}
