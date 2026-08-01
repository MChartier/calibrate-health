import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppTheme } from '../theme';
import type { CalendarModalProps } from './CalendarModal';

const CALENDAR_MODAL_Z_INDEX = 1_000; // Keeps the date picker above the fixed web app shell.
const CALENDAR_SHEET_MAX_HEIGHT = '94vh'; // Leaves context around the modal on short browser viewports.
const FOCUSABLE_ELEMENT_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(','); // Covers native controls plus focusable elements emitted by React Native Web.

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

function activateFocusTrap(sheet: HTMLElement, onRequestClose: () => void): () => void {
    const ownerDocument = sheet.ownerDocument;
    const previouslyFocusedElement = ownerDocument.activeElement instanceof HTMLElement
        ? ownerDocument.activeElement
        : null;

    function focusFirstElement() {
        (getFocusableElements(sheet)[0] ?? sheet).focus();
    }

    function containKeyboardFocus(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onRequestClose();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusableElements = getFocusableElements(sheet);
        if (focusableElements.length === 0) {
            event.preventDefault();
            sheet.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = ownerDocument.activeElement;
        if (event.shiftKey && (activeElement === firstElement || !sheet.contains(activeElement))) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && (activeElement === lastElement || !sheet.contains(activeElement))) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    function containProgrammaticFocus(event: FocusEvent) {
        if (event.target instanceof Node && sheet.contains(event.target)) return;
        focusFirstElement();
    }

    ownerDocument.addEventListener('keydown', containKeyboardFocus);
    ownerDocument.addEventListener('focusin', containProgrammaticFocus);
    focusFirstElement();

    return () => {
        ownerDocument.removeEventListener('keydown', containKeyboardFocus);
        ownerDocument.removeEventListener('focusin', containProgrammaticFocus);
        if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
    };
}

/** Web portal avoids React Native Modal painting and hit-testing inconsistencies in browsers. */
export const CalendarModal: React.FC<CalendarModalProps> = ({
    visible,
    onRequestClose,
    children
}) => {
    const theme = useAppTheme();
    const sheetRef = useRef<HTMLDivElement>(null);
    const onRequestCloseRef = useRef(onRequestClose);

    useEffect(() => {
        onRequestCloseRef.current = onRequestClose;
    }, [onRequestClose]);

    useEffect(() => {
        if (!visible || typeof document === 'undefined') return;
        const sheet = sheetRef.current;
        if (!sheet) return;
        return activateFocusTrap(sheet, () => onRequestCloseRef.current());
    }, [visible]);

    if (!visible || typeof document === 'undefined') return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: CALENDAR_MODAL_Z_INDEX
            }}
        >
            <div
                aria-hidden="true"
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
            />
            <div
                ref={sheetRef}
                aria-label="Calendar"
                aria-modal="true"
                role="dialog"
                tabIndex={-1}
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
