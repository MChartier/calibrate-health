import React from 'react';
import { useAppTheme } from '../theme';
import {
    browserPwaRuntime,
    PWA_NETWORK_STATES,
    PWA_UPDATE_STATES,
    type PwaRuntime,
    usePwaStatus
} from './runtime.web';

export const BROWSER_OFFLINE_MESSAGE = 'Queued changes stay on this device and sync when the server is reachable.';

type NoticeProps = {
    role: 'alert' | 'status';
    title: string;
    detail: string;
    background: string;
    foreground: string;
    border: string;
    action?: {
        label: string;
        disabled?: boolean;
        onClick(): void;
    };
};

function Notice({ role, title, detail, background, foreground, border, action }: NoticeProps) {
    const style: React.CSSProperties = {
        width: 'min(680px, calc(100vw - 24px))',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 56,
        padding: '10px 12px 10px 16px',
        border: `1px solid ${border}`,
        borderRadius: 12,
        background,
        color: foreground,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)',
        font: '500 14px/20px system-ui, sans-serif',
        pointerEvents: 'auto'
    };
    const copyStyle: React.CSSProperties = { minWidth: 0 };
    const titleStyle: React.CSSProperties = { display: 'block', fontWeight: 800 };
    const detailStyle: React.CSSProperties = { display: 'block' };
    const buttonStyle: React.CSSProperties = {
        flexShrink: 0,
        minWidth: 88,
        minHeight: 48,
        padding: '8px 14px',
        border: `1px solid ${foreground}`,
        borderRadius: 10,
        background: 'transparent',
        color: foreground,
        font: '800 14px/20px system-ui, sans-serif',
        cursor: action?.disabled ? 'wait' : 'pointer',
        opacity: action?.disabled ? 0.7 : 1
    };

    return (
        <div role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'} style={style}>
            <span style={copyStyle}>
                <span style={titleStyle}>{title}</span>
                <span style={detailStyle}>{detail}</span>
            </span>
            {action && (
                <button type="button" disabled={action.disabled} style={buttonStyle} onClick={action.onClick}>
                    {action.label}
                </button>
            )}
        </div>
    );
}

export function PwaStatusBanner({ runtime = browserPwaRuntime }: { runtime?: PwaRuntime }) {
    const theme = useAppTheme();
    const { network, update, applyUpdate, retryUpdate } = usePwaStatus(runtime);
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 12,
        left: 0,
        right: 0,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none'
    };
    const notices: React.ReactNode[] = [];

    if (network === PWA_NETWORK_STATES.OFFLINE) {
        notices.push(
            <Notice
                key="offline"
                role="alert"
                title="You're offline"
                detail={BROWSER_OFFLINE_MESSAGE}
                background={theme.colors.warningContainer}
                foreground={theme.colors.onWarningContainer}
                border={theme.colors.warning}
            />
        );
    } else if (network === PWA_NETWORK_STATES.BACK_ONLINE) {
        notices.push(
            <Notice
                key="online"
                role="status"
                title="Back online"
                detail="Queued changes are syncing now."
                background={theme.colors.successContainer}
                foreground={theme.colors.onSuccessContainer}
                border={theme.colors.success}
            />
        );
    }

    if (update === PWA_UPDATE_STATES.READY || update === PWA_UPDATE_STATES.APPLYING) {
        const applying = update === PWA_UPDATE_STATES.APPLYING;
        notices.push(
            <Notice
                key="update"
                role="status"
                title={applying ? 'Updating Calibrate' : 'Update ready'}
                detail={applying ? 'Finishing the update and refreshing...' : 'Refresh to use the latest version.'}
                background={theme.colors.infoContainer}
                foreground={theme.colors.onInfoContainer}
                border={theme.colors.info}
                action={{ label: applying ? 'Refreshing' : 'Refresh', disabled: applying, onClick: applyUpdate }}
            />
        );
    } else if (update === PWA_UPDATE_STATES.ERROR) {
        notices.push(
            <Notice
                key="update-error"
                role="alert"
                title="Update failed"
                detail="Calibrate could not install the update. Check your connection and try again."
                background={theme.colors.dangerContainer}
                foreground={theme.colors.onDangerContainer}
                border={theme.colors.danger}
                action={{ label: 'Try again', onClick: () => void retryUpdate() }}
            />
        );
    }

    if (notices.length === 0) return null;
    return <div style={containerStyle}>{notices}</div>;
}
