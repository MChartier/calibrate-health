import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppTheme } from '../theme';
import type { CalendarModalProps } from './CalendarModal';

const CALENDAR_MODAL_Z_INDEX = 1_000; // Keeps the date picker above the fixed web app shell.
const CALENDAR_SHEET_MAX_HEIGHT = '94vh'; // Leaves context around the modal on short browser viewports.

/** Web portal avoids React Native Modal painting and hit-testing inconsistencies in browsers. */
export const CalendarModal: React.FC<CalendarModalProps> = ({
    visible,
    onRequestClose,
    children
}) => {
    const theme = useAppTheme();

    useEffect(() => {
        if (!visible || typeof document === 'undefined') return;
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') onRequestClose();
        }
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onRequestClose, visible]);

    if (!visible || typeof document === 'undefined') return null;

    return createPortal(
        <div
            aria-modal="true"
            role="dialog"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: CALENDAR_MODAL_Z_INDEX
            }}
        >
            <button
                aria-label="Close dialog"
                onClick={onRequestClose}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    border: 0,
                    background: theme.colors.scrim,
                    cursor: 'default'
                }}
                type="button"
            />
            <div
                style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    left: 0,
                    maxHeight: CALENDAR_SHEET_MAX_HEIGHT,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: `${theme.spacing.md}px ${theme.spacing.lg}px max(${theme.spacing.lg}px, env(safe-area-inset-bottom))`,
                    borderTop: `${theme.stroke.control}px solid ${theme.colors.outlineVariant}`,
                    borderTopLeftRadius: theme.radius.sheet,
                    borderTopRightRadius: theme.radius.sheet,
                    background: theme.colors.surfaceContainerLow,
                    boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.18)'
                }}
            >
                <div
                    aria-hidden="true"
                    style={{
                        width: 44,
                        height: 4,
                        margin: `0 auto ${theme.spacing.md}px`,
                        borderRadius: theme.radius.pill,
                        background: theme.colors.outline
                    }}
                />
                {children}
            </div>
        </div>,
        document.body
    );
};
