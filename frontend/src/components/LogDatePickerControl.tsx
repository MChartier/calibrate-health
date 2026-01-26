import React, { useRef } from 'react';
import { Box, TextField } from '@mui/material';

const LOG_DATE_CONTROL_HEIGHT_SPACING = { xs: 9, sm: 9, md: 7 }; // Include top inset on compact layouts without shrinking the inner field height.
const LOG_DATE_CONTROL_TOP_PADDING_SPACING = { xs: 2, sm: 2, md: 0 }; // Keep the floating label inside the control when page padding is minimal.
const NAVBAR_LOG_DATE_CONTROL_HEIGHT_SPACING = { xs: 6, sm: 6, md: 6 }; // Compact height so the control fits within the AppBar without increasing toolbar height.
const NAVBAR_LOG_DATE_CONTROL_TOP_PADDING_SPACING = { xs: 0, sm: 0, md: 0 }; // The navbar already provides vertical padding; do not add extra top inset.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX = 2; // Thickness of the keyboard focus ring on the date control overlay.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX = 2; // Gap between the overlay outline and the field chrome.

type LogDateControlPlacement = 'page' | 'navbar';

type LogDateControlMetrics = {
    heightSpacing: typeof LOG_DATE_CONTROL_HEIGHT_SPACING;
    topPaddingSpacing: typeof LOG_DATE_CONTROL_TOP_PADDING_SPACING;
};

/**
 * Resolve spacing metrics for the date control based on where it is rendered.
 */
function getLogDateControlMetrics(placement: LogDateControlPlacement): LogDateControlMetrics {
    if (placement === 'navbar') {
        return {
            heightSpacing: NAVBAR_LOG_DATE_CONTROL_HEIGHT_SPACING,
            topPaddingSpacing: NAVBAR_LOG_DATE_CONTROL_TOP_PADDING_SPACING
        };
    }

    return {
        heightSpacing: LOG_DATE_CONTROL_HEIGHT_SPACING,
        topPaddingSpacing: LOG_DATE_CONTROL_TOP_PADDING_SPACING
    };
}

type LogDatePickerControlProps = {
    value: string;
    label: string;
    ariaLabel: string;
    min: string;
    max: string;
    onChange: (nextDate: string) => void;
    placement?: LogDateControlPlacement;
};

/**
 * Open a native browser date picker for an `<input type="date">` when supported.
 *
 * Chrome/Edge expose `HTMLInputElement.showPicker()` which lets us make the entire control open the picker (not just
 * the calendar icon), avoiding the fiddly "edit month/day/year segments" interaction.
 */
function showNativeDatePicker(input: HTMLInputElement | null) {
    if (!input) return;

    try {
        const maybeShowPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
        if (typeof maybeShowPicker === 'function') {
            maybeShowPicker.call(input);
            return;
        }
    } catch {
        // Ignore - some browsers throw when attempting to show a picker programmatically.
    }

    // Fallbacks: try click() first (often opens the picker); if that fails, focus the hidden input.
    input.click();
    input.focus();
}

/**
 * LogDatePickerControl
 *
 * Self-contained date picker field with placement-aware sizing.
 * The page placement reserves extra height/top padding to keep the floating label visible under the app bar,
 * while the navbar placement stays compact so the toolbar height remains stable.
 */
const LogDatePickerControl: React.FC<LogDatePickerControlProps> = ({
    value,
    label,
    ariaLabel,
    min,
    max,
    onChange,
    placement = 'page'
}) => {
    const dateOverlayButtonRef = useRef<HTMLButtonElement | null>(null);
    const datePickerInputRef = useRef<HTMLInputElement | null>(null);
    const metrics = getLogDateControlMetrics(placement);

    return (
        <Box
            sx={(theme) => ({
                position: 'relative',
                flexGrow: 1,
                minWidth: 0,
                height: {
                    xs: theme.spacing(metrics.heightSpacing.xs),
                    sm: theme.spacing(metrics.heightSpacing.sm),
                    md: theme.spacing(metrics.heightSpacing.md)
                },
                pt: {
                    xs: theme.spacing(metrics.topPaddingSpacing.xs),
                    sm: theme.spacing(metrics.topPaddingSpacing.sm),
                    md: theme.spacing(metrics.topPaddingSpacing.md)
                }
            })}
        >
            <TextField
                label={label}
                type="date"
                value={value}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                    min,
                    max,
                    readOnly: true,
                    tabIndex: -1
                }}
                sx={{
                    width: '100%',
                    '& input': { textAlign: 'center' },
                    // Native `type="date"` inputs render differently per-browser; these help keep the value visually centered
                    // in Chrome/Safari without affecting the calendar icon alignment.
                    '& input::-webkit-datetime-edit': { textAlign: 'center' },
                    '& input::-webkit-date-and-time-value': { textAlign: 'center' },
                    '& input::-webkit-datetime-edit-fields-wrapper': {
                        display: 'flex',
                        justifyContent: 'center'
                    }
                }}
            />

            {/* Hidden input used solely for the browser's native date picker UI. */}
            <Box
                component="input"
                type="date"
                ref={datePickerInputRef}
                value={value}
                min={min}
                max={max}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const nextDate = e.target.value;
                    if (!nextDate) return;
                    onChange(nextDate);
                    dateOverlayButtonRef.current?.focus({ preventScroll: true });
                }}
                sx={(theme) => ({
                    position: 'absolute',
                    top: {
                        xs: theme.spacing(metrics.topPaddingSpacing.xs),
                        sm: theme.spacing(metrics.topPaddingSpacing.sm),
                        md: theme.spacing(metrics.topPaddingSpacing.md)
                    },
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: 0,
                    pointerEvents: 'none'
                })}
            />

            {/*
                Overlay button: makes the whole field open the date picker without focusing the visible
                input's "month/day/year" segments (which feels fiddly on mobile).
                The overlay itself is the focus target for keyboard navigation.
            */}
            <Box
                component="button"
                type="button"
                ref={dateOverlayButtonRef}
                aria-label={ariaLabel}
                onClick={() => showNativeDatePicker(datePickerInputRef.current)}
                sx={(theme) => ({
                    position: 'absolute',
                    top: {
                        xs: theme.spacing(metrics.topPaddingSpacing.xs),
                        sm: theme.spacing(metrics.topPaddingSpacing.sm),
                        md: theme.spacing(metrics.topPaddingSpacing.md)
                    },
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1,
                    cursor: 'pointer',
                    borderRadius: theme.shape.borderRadius,
                    WebkitTapHighlightColor: 'transparent',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    margin: 0,
                    outline: 'none',
                    '&:active': { backgroundColor: theme.palette.action.hover },
                    '&:focus-visible': {
                        outline: `${LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX}px solid ${theme.palette.primary.main}`,
                        outlineOffset: `${LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX}px`
                    }
                })}
            />
        </Box>
    );
};

export default LogDatePickerControl;
