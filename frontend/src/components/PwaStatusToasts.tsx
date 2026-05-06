import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import { useI18n } from '../i18n/useI18n';
import { usePwaRuntimeState } from '../pwa/runtime';

const TRANSIENT_PWA_STATUS_DURATION_MS = 4500; // Keeps success/status notices visible without lingering over app controls.
const MOBILE_SNACKBAR_BOTTOM_OFFSET = 'calc(80px + var(--safe-area-inset-bottom, 0px))'; // Clear the fixed bottom nav in installed mobile layouts.

type PwaToastKind = 'offline' | 'online' | 'updateReady' | 'updateFailed';

type PwaToastState = {
    kind: PwaToastKind;
    message: string;
    severity: 'info' | 'success' | 'warning' | 'error';
    persist: boolean;
};

/**
 * Resolve navigator.onLine once, defaulting to online during non-browser rendering.
 */
function getInitialOnlineState(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
}

/**
 * Surface PWA runtime states that would otherwise be silent browser/service-worker behavior.
 */
const PwaStatusToasts: React.FC = () => {
    const { t } = useI18n();
    const pwaRuntime = usePwaRuntimeState();
    const [isOnline, setIsOnline] = useState(getInitialOnlineState);
    const [networkToast, setNetworkToast] = useState<PwaToastKind | null>(() =>
        getInitialOnlineState() ? null : 'offline'
    );
    const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
    const [updateFailed, setUpdateFailed] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setNetworkToast('online');
        };
        const handleOffline = () => {
            setIsOnline(false);
            setNetworkToast('offline');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleApplyUpdate = useCallback(async () => {
        if (!pwaRuntime.updateServiceWorker || isApplyingUpdate) {
            return;
        }

        setIsApplyingUpdate(true);
        setUpdateFailed(false);

        try {
            await pwaRuntime.updateServiceWorker();
        } catch {
            setUpdateFailed(true);
            setIsApplyingUpdate(false);
        }
    }, [isApplyingUpdate, pwaRuntime]);

    const toast = useMemo<PwaToastState | null>(() => {
        if (updateFailed) {
            return {
                kind: 'updateFailed',
                message: t('pwa.updateFailed'),
                severity: 'error',
                persist: false
            };
        }

        if (pwaRuntime.updateAvailable) {
            return {
                kind: 'updateReady',
                message: t('pwa.updateReady'),
                severity: 'info',
                persist: true
            };
        }

        if (!isOnline || networkToast === 'offline') {
            return {
                kind: 'offline',
                message: t('pwa.offline'),
                severity: 'warning',
                persist: true
            };
        }

        if (networkToast === 'online') {
            return {
                kind: 'online',
                message: t('pwa.backOnline'),
                severity: 'success',
                persist: false
            };
        }

        return null;
    }, [
        isOnline,
        networkToast,
        pwaRuntime.updateAvailable,
        t,
        updateFailed
    ]);

    const handleClose = useCallback(
        (_event?: React.SyntheticEvent | Event, reason?: string) => {
            if (reason === 'clickaway') {
                return;
            }

            if (toast?.kind === 'offline' || toast?.kind === 'updateReady') {
                return;
            }

            if (toast?.kind === 'online') {
                setNetworkToast(null);
            }

            if (toast?.kind === 'updateFailed') {
                setUpdateFailed(false);
            }
        },
        [toast?.kind]
    );

    const action =
        toast?.kind === 'updateReady' ? (
            <Button color="inherit" size="small" onClick={handleApplyUpdate} disabled={isApplyingUpdate}>
                {t('pwa.updateAction')}
            </Button>
        ) : undefined;

    return (
        <Snackbar
            open={Boolean(toast)}
            autoHideDuration={toast?.persist ? null : TRANSIENT_PWA_STATUS_DURATION_MS}
            onClose={handleClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            sx={{
                bottom: {
                    xs: MOBILE_SNACKBAR_BOTTOM_OFFSET,
                    md: 24
                }
            }}
        >
            {toast ? (
                <Alert severity={toast.severity} action={action} onClose={toast.persist ? undefined : handleClose}>
                    {toast.message}
                </Alert>
            ) : undefined}
        </Snackbar>
    );
};

export default PwaStatusToasts;
