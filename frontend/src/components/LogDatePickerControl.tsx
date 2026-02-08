import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Box,
    CircularProgress,
    IconButton,
    Popover,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import { useTheme } from '@mui/material/styles';
import { addDaysToIsoDate } from '../utils/date';
import { useI18n } from '../i18n/useI18n';
import { useFoodLogDayRangeQuery } from '../queries/foodLogDay';

const LOG_DATE_CONTROL_HEIGHT_SPACING = { xs: 9, sm: 9, md: 7 }; // Include top inset on compact layouts without shrinking the inner field height.
const LOG_DATE_CONTROL_TOP_PADDING_SPACING = { xs: 2, sm: 2, md: 0 }; // Keep the floating label inside the control when page padding is minimal.
const NAVBAR_LOG_DATE_CONTROL_HEIGHT_SPACING = { xs: 5, sm: 5, md: 5 }; // Match the small TextField height (40px) so the control stays within the AppBar.
const NAVBAR_LOG_DATE_CONTROL_TOP_PADDING_SPACING = { xs: 0, sm: 0, md: 0 }; // The navbar already provides vertical padding; do not add extra top inset.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX = 2; // Thickness of the keyboard focus ring on the date control overlay.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX = 2; // Gap between the overlay outline and the field chrome.
const LOG_DATE_PICKER_POPOVER_WIDTH_PX = 300; // Fixed popover width keeps the 7-column calendar grid stable.
const LOG_DATE_PICKER_POPOVER_PADDING_SPACING = 1.5; // Inner popover spacing for month controls, week labels, and day grid.
const LOG_DATE_PICKER_DAY_CELL_SIZE_PX = 34; // Square size for each day button to keep touch targets consistent.
const LOG_DATE_PICKER_TOTAL_CALENDAR_CELLS = 42; // 6 rows * 7 columns ensures all months fit without layout jumps.
const LOG_DATE_PICKER_WEEKDAY_GAP_SPACING = 0.5; // Horizontal spacing between weekday/day columns.
const LOG_DATE_PICKER_COMPLETE_DAY_OUTLINE_PX = 2; // Outline thickness used when a complete day is also selected.

type LogDateControlPlacement = 'page' | 'navbar';

type LogDateControlMetrics = {
    heightSpacing: typeof LOG_DATE_CONTROL_HEIGHT_SPACING;
    topPaddingSpacing: typeof LOG_DATE_CONTROL_TOP_PADDING_SPACING;
};

type CalendarDayCell = {
    dateIso: string;
    dayNumber: number;
    isInVisibleMonth: boolean;
};

type LogDatePickerControlProps = {
    value: string;
    label?: string;
    ariaLabel: string;
    min: string;
    max: string;
    onChange: (nextDate: string) => void;
    placement?: LogDateControlPlacement;
};

const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SUNDAY_REFERENCE_UTC = new Date(Date.UTC(2023, 0, 1)); // Jan 1, 2023 was a Sunday and anchors weekday labels.

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

/**
 * Parse `YYYY-MM` into numeric year/month values.
 */
function parseIsoMonth(monthIso: string): { year: number; month: number } | null {
    const match = monthIso.match(ISO_MONTH_PATTERN);
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}

/**
 * Parse `YYYY-MM-DD` into numeric year/month/day values.
 */
function parseIsoDate(dateIso: string): { year: number; month: number; day: number } | null {
    const match = dateIso.match(ISO_DATE_PATTERN);
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return { year, month, day };
}

/**
 * Return the `YYYY-MM` prefix for a valid ISO date.
 */
function getMonthKeyFromIsoDate(dateIso: string): string {
    return dateIso.slice(0, 7);
}

/**
 * Return the first day (`YYYY-MM-01`) for a month key.
 */
function getMonthStartIso(monthIso: string): string {
    return `${monthIso}-01`;
}

/**
 * Return the final day (`YYYY-MM-DD`) for a month key.
 */
function getMonthEndIso(monthIso: string): string {
    const parsed = parseIsoMonth(monthIso);
    if (!parsed) return `${monthIso}-31`;
    const endOfMonthUtc = new Date(Date.UTC(parsed.year, parsed.month, 0));
    return endOfMonthUtc.toISOString().slice(0, 10);
}

/**
 * Shift a `YYYY-MM` month key by whole-month deltas.
 */
function addMonthsToIsoMonth(monthIso: string, deltaMonths: number): string {
    const parsed = parseIsoMonth(monthIso);
    if (!parsed) return monthIso;

    const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + deltaMonths, 1));
    return shifted.toISOString().slice(0, 7);
}

/**
 * Format a date-only ISO string for display inside the control input.
 */
function formatControlDateValue(dateIso: string, locale: string): string {
    const parsed = parseIsoDate(dateIso);
    if (!parsed) return dateIso;

    try {
        const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
        return new Intl.DateTimeFormat(locale, {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(date);
    } catch {
        return dateIso;
    }
}

/**
 * Format a month key as a localized header label (e.g. "January 2026").
 */
function formatMonthLabel(monthIso: string, locale: string): string {
    const parsed = parseIsoMonth(monthIso);
    if (!parsed) return monthIso;

    try {
        const date = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
        return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
    } catch {
        return monthIso;
    }
}

/**
 * Build weekday headers (Sunday-first) for the current locale.
 */
function buildWeekdayLabels(locale: string): string[] {
    return Array.from({ length: 7 }, (_unused, index) => {
        const date = new Date(SUNDAY_REFERENCE_UTC);
        date.setUTCDate(SUNDAY_REFERENCE_UTC.getUTCDate() + index);
        return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'narrow' }).format(date);
    });
}

/**
 * Build the 6x7 calendar cells for a month, including leading/trailing days.
 */
function buildCalendarCells(monthIso: string): CalendarDayCell[] {
    const monthStartIso = getMonthStartIso(monthIso);
    const monthStart = parseIsoDate(monthStartIso);
    if (!monthStart) return [];

    const firstOfMonth = new Date(Date.UTC(monthStart.year, monthStart.month - 1, 1));
    const firstWeekdayOffset = firstOfMonth.getUTCDay();
    const firstGridDateIso = addDaysToIsoDate(monthStartIso, -firstWeekdayOffset);

    return Array.from({ length: LOG_DATE_PICKER_TOTAL_CALENDAR_CELLS }, (_unused, index) => {
        const dateIso = addDaysToIsoDate(firstGridDateIso, index);
        return {
            dateIso,
            dayNumber: Number.parseInt(dateIso.slice(8, 10), 10),
            isInVisibleMonth: dateIso.startsWith(`${monthIso}-`)
        };
    });
}

/**
 * Inclusive bound-check helper for `YYYY-MM-DD` values.
 */
function isDateWithinBounds(dateIso: string, bounds: { min: string; max: string }): boolean {
    return dateIso >= bounds.min && dateIso <= bounds.max;
}

/**
 * LogDatePickerControl
 *
 * Stylable date picker field with placement-aware sizing and a calendar popover.
 * Complete days are rendered as success-colored circles so users can quickly scan logged progress.
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
    const { language, t } = useI18n();
    const theme = useTheme();
    const dateOverlayButtonRef = useRef<HTMLButtonElement | null>(null);
    const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null);
    const [visibleMonthIso, setVisibleMonthIso] = useState(() => getMonthKeyFromIsoDate(value));

    const metrics = getLogDateControlMetrics(placement);
    const isNavbarPlacement = placement === 'navbar';
    const calendarOpen = Boolean(anchorElement);
    const dateBounds = useMemo(() => ({ min, max }), [max, min]);

    const monthLabel = useMemo(() => formatMonthLabel(visibleMonthIso, language), [language, visibleMonthIso]);
    const weekdayLabels = useMemo(() => buildWeekdayLabels(language), [language]);
    const calendarCells = useMemo(() => buildCalendarCells(visibleMonthIso), [visibleMonthIso]);
    const controlDisplayValue = useMemo(() => formatControlDateValue(value, language), [language, value]);

    const visibleMonthStartIso = getMonthStartIso(visibleMonthIso);
    const visibleMonthEndIso = getMonthEndIso(visibleMonthIso);
    const monthCompletionQuery = useFoodLogDayRangeQuery(visibleMonthStartIso, visibleMonthEndIso, {
        enabled: calendarOpen
    });

    const completeDateSet = useMemo(() => {
        const completedDates = new Set<string>();
        for (const day of monthCompletionQuery.data?.days ?? []) {
            if (day.is_complete) {
                completedDates.add(day.date);
            }
        }
        return completedDates;
    }, [monthCompletionQuery.data?.days]);

    const previousMonthIso = useMemo(() => addMonthsToIsoMonth(visibleMonthIso, -1), [visibleMonthIso]);
    const nextMonthIso = useMemo(() => addMonthsToIsoMonth(visibleMonthIso, 1), [visibleMonthIso]);

    const canGoToPreviousMonth = getMonthEndIso(previousMonthIso) >= dateBounds.min;
    const canGoToNextMonth = getMonthStartIso(nextMonthIso) <= dateBounds.max;

    const openCalendar = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        setVisibleMonthIso(getMonthKeyFromIsoDate(value));
        setAnchorElement(event.currentTarget);
    }, [value]);

    const closeCalendar = useCallback(() => {
        setAnchorElement(null);
    }, []);

    const focusTriggerButton = useCallback(() => {
        dateOverlayButtonRef.current?.focus({ preventScroll: true });
    }, []);

    const handleSelectDay = useCallback(
        (nextDateIso: string) => {
            if (!isDateWithinBounds(nextDateIso, dateBounds)) return;
            onChange(nextDateIso);
            setVisibleMonthIso(getMonthKeyFromIsoDate(nextDateIso));
            closeCalendar();
            focusTriggerButton();
        },
        [closeCalendar, dateBounds, focusTriggerButton, onChange]
    );

    const handleGoToPreviousMonth = useCallback(() => {
        if (!canGoToPreviousMonth) return;
        setVisibleMonthIso(previousMonthIso);
    }, [canGoToPreviousMonth, previousMonthIso]);

    const handleGoToNextMonth = useCallback(() => {
        if (!canGoToNextMonth) return;
        setVisibleMonthIso(nextMonthIso);
    }, [canGoToNextMonth, nextMonthIso]);

    return (
        <Box
            sx={(themeForSizing) => ({
                position: 'relative',
                flexGrow: 1,
                minWidth: 0,
                height: {
                    xs: themeForSizing.spacing(metrics.heightSpacing.xs),
                    sm: themeForSizing.spacing(metrics.heightSpacing.sm),
                    md: themeForSizing.spacing(metrics.heightSpacing.md)
                },
                pt: {
                    xs: themeForSizing.spacing(metrics.topPaddingSpacing.xs),
                    sm: themeForSizing.spacing(metrics.topPaddingSpacing.sm),
                    md: themeForSizing.spacing(metrics.topPaddingSpacing.md)
                }
            })}
        >
            <TextField
                label={label}
                value={controlDisplayValue}
                size={isNavbarPlacement ? 'small' : undefined}
                InputLabelProps={label ? { shrink: true } : undefined}
                inputProps={{
                    readOnly: true,
                    tabIndex: -1
                }}
                sx={{
                    width: '100%',
                    ...(isNavbarPlacement ? { '& .MuiInputLabel-root': { display: 'none' } } : null),
                    '& input': { textAlign: 'center' }
                }}
            />

            {/*
                Overlay button: keeps a large click/tap target and avoids text-selection interactions
                inside the read-only input field.
            */}
            <Box
                component="button"
                type="button"
                ref={dateOverlayButtonRef}
                aria-label={ariaLabel}
                onClick={openCalendar}
                sx={(themeForButton) => ({
                    position: 'absolute',
                    top: {
                        xs: themeForButton.spacing(metrics.topPaddingSpacing.xs),
                        sm: themeForButton.spacing(metrics.topPaddingSpacing.sm),
                        md: themeForButton.spacing(metrics.topPaddingSpacing.md)
                    },
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1,
                    cursor: 'pointer',
                    borderRadius: themeForButton.shape.borderRadius,
                    WebkitTapHighlightColor: 'transparent',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    margin: 0,
                    outline: 'none',
                    '&:active': { backgroundColor: themeForButton.palette.action.hover },
                    '&:focus-visible': {
                        outline: `${LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX}px solid ${themeForButton.palette.primary.main}`,
                        outlineOffset: `${LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX}px`
                    }
                })}
            />

            <Popover
                open={calendarOpen}
                anchorEl={anchorElement}
                onClose={() => {
                    closeCalendar();
                    focusTriggerButton();
                }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                slotProps={{
                    paper: {
                        sx: {
                            width: LOG_DATE_PICKER_POPOVER_WIDTH_PX,
                            p: LOG_DATE_PICKER_POPOVER_PADDING_SPACING,
                            borderRadius: 2
                        }
                    }
                }}
            >
                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Tooltip title={t('log.datePicker.prevMonth')}>
                            <span>
                                <IconButton
                                    size="small"
                                    aria-label={t('log.datePicker.prevMonth')}
                                    onClick={handleGoToPreviousMonth}
                                    disabled={!canGoToPreviousMonth}
                                >
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2">{monthLabel}</Typography>
                            {monthCompletionQuery.isLoading && <CircularProgress size={14} />}
                        </Box>

                        <Tooltip title={t('log.datePicker.nextMonth')}>
                            <span>
                                <IconButton
                                    size="small"
                                    aria-label={t('log.datePicker.nextMonth')}
                                    onClick={handleGoToNextMonth}
                                    disabled={!canGoToNextMonth}
                                >
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>

                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: LOG_DATE_PICKER_WEEKDAY_GAP_SPACING
                        }}
                    >
                        {weekdayLabels.map((weekdayLabel, index) => (
                            <Typography
                                key={`${weekdayLabel}-${index}`}
                                variant="caption"
                                sx={{
                                    textAlign: 'center',
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                    lineHeight: 1.25
                                }}
                            >
                                {weekdayLabel}
                            </Typography>
                        ))}
                    </Box>

                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: LOG_DATE_PICKER_WEEKDAY_GAP_SPACING
                        }}
                    >
                        {calendarCells.map((cell) => {
                            const isSelected = cell.dateIso === value;
                            const isWithinBounds = isDateWithinBounds(cell.dateIso, dateBounds);
                            const isComplete = completeDateSet.has(cell.dateIso);

                            let textColor = cell.isInVisibleMonth
                                ? theme.palette.text.primary
                                : theme.palette.text.disabled;
                            let backgroundColor = 'transparent';
                            let border = '1px solid transparent';
                            let opacity = 1;

                            if (isComplete) {
                                backgroundColor = theme.palette.success.main;
                                textColor = theme.palette.success.contrastText;
                            }

                            if (isSelected) {
                                if (isComplete) {
                                    border = `${LOG_DATE_PICKER_COMPLETE_DAY_OUTLINE_PX}px solid ${theme.palette.primary.main}`;
                                } else {
                                    backgroundColor = theme.palette.primary.main;
                                    textColor = theme.palette.primary.contrastText;
                                }
                            }

                            if (!isWithinBounds) {
                                backgroundColor = 'transparent';
                                border = '1px solid transparent';
                                textColor = theme.palette.action.disabled;
                                opacity = 0.6;
                            }

                            let hoverBackgroundColor = theme.palette.action.hover;
                            if (isComplete) {
                                hoverBackgroundColor = theme.palette.success.dark;
                            } else if (isSelected) {
                                hoverBackgroundColor = theme.palette.primary.dark;
                            }

                            return (
                                <Box
                                    key={cell.dateIso}
                                    component="button"
                                    type="button"
                                    onClick={() => handleSelectDay(cell.dateIso)}
                                    disabled={!isWithinBounds}
                                    aria-label={cell.dateIso}
                                    sx={{
                                        width: LOG_DATE_PICKER_DAY_CELL_SIZE_PX,
                                        height: LOG_DATE_PICKER_DAY_CELL_SIZE_PX,
                                        borderRadius: '50%',
                                        border,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto',
                                        backgroundColor,
                                        color: textColor,
                                        opacity,
                                        fontSize: theme.typography.body2.fontSize,
                                        fontWeight: isSelected ? 700 : 500,
                                        lineHeight: 1,
                                        cursor: isWithinBounds ? 'pointer' : 'default',
                                        transition: theme.transitions.create(['background-color', 'border-color', 'color'], {
                                            duration: theme.transitions.duration.shorter
                                        }),
                                        '&:hover': isWithinBounds
                                            ? {
                                                  backgroundColor: hoverBackgroundColor
                                              }
                                            : undefined,
                                        '&:focus-visible': {
                                            outline: `${LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX}px solid ${theme.palette.primary.main}`,
                                            outlineOffset: '1px'
                                        }
                                    }}
                                >
                                    {cell.dayNumber}
                                </Box>
                            );
                        })}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: 'success.main',
                                flexShrink: 0
                            }}
                        />
                        <Typography variant="caption" color="text.secondary">
                            {t('log.datePicker.completeLegend')}
                        </Typography>
                    </Box>

                    {monthCompletionQuery.isError && (
                        <Typography variant="caption" color="text.secondary">
                            {t('log.completion.actionUnavailable')}
                        </Typography>
                    )}
                </Stack>
            </Popover>
        </Box>
    );
};

export default LogDatePickerControl;
