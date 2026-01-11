import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    IconButton,
    TextField,
    Tooltip
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import TodayIcon from '@mui/icons-material/TodayRounded';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQueryClient } from '@tanstack/react-query';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightSummaryCard from '../components/WeightSummaryCard';
import { useAuth } from '../context/useAuth';
import { useQuickAddFab } from '../context/useQuickAddFab';
import {
    addDaysToIsoDate,
    clampIsoDate,
    formatDateToLocalDateString,
    formatIsoDateForDisplay,
    getTodayIsoDate
} from '../utils/date';
import { fetchFoodLog, foodLogQueryKey, useFoodLogQuery } from '../queries/foodLog';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';

const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX = 2; // Thickness of the keyboard focus ring on the date control overlay.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX = 2; // Gap between the overlay outline and the field chrome.

type LogDateBounds = { min: string; max: string };

/**
 * Compute inclusive local-day bounds for /log date navigation.
 *
 * Lower bound: the user's account creation day (prevents absurd date ranges like year 0001).
 * Upper bound: today in the user's timezone (no future days).
 */
function getLogDateBounds(args: { todayIso: string; createdAtIso?: string; timeZone: string }): LogDateBounds {
    const max = args.todayIso;
    const createdAt = args.createdAtIso;
    if (!createdAt) return { min: max, max };

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) return { min: max, max };

    const minRaw = formatDateToLocalDateString(createdAtDate, args.timeZone);
    // Defensive: if clocks are skewed, ensure bounds stay sane.
    const min = minRaw > max ? max : minRaw;
    return { min, max };
}

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

const Log: React.FC = () => {
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const { user } = useAuth();
    const { openWeightDialogForLogDate, setLogDateOverride } = useQuickAddFab();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const today = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const dateBounds = useMemo(() => {
        return getLogDateBounds({ todayIso: today, createdAtIso: user?.created_at, timeZone });
    }, [today, timeZone, user?.created_at]);

    const [selectedDate, setSelectedDate] = useState(() => today);
    const dateOverlayButtonRef = useRef<HTMLButtonElement | null>(null);
    const datePickerInputRef = useRef<HTMLInputElement | null>(null);

    // Clamp selection when the bounds change (e.g. user profile loads, timezone changes).
    useEffect(() => {
        setSelectedDate((prev) => {
            const clamped = clampIsoDate(prev, dateBounds);
            return clamped === prev ? prev : clamped;
        });
    }, [dateBounds]);

    const effectiveDate = clampIsoDate(selectedDate, dateBounds);
    const effectiveDateLabel = useMemo(() => formatIsoDateForDisplay(effectiveDate), [effectiveDate]);

    const foodQuery = useFoodLogQuery(effectiveDate);

    useEffect(() => {
        const prevDate = addDaysToIsoDate(effectiveDate, -1);
        if (prevDate >= dateBounds.min) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(prevDate),
                queryFn: () => fetchFoodLog(prevDate)
            });
        }

        const nextDate = addDaysToIsoDate(effectiveDate, 1);
        if (nextDate <= dateBounds.max) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(nextDate),
                queryFn: () => fetchFoodLog(nextDate)
            });
        }
    }, [dateBounds.max, dateBounds.min, effectiveDate, queryClient]);

    const canGoBack = effectiveDate > dateBounds.min;
    const canGoForward = effectiveDate < dateBounds.max;

    useEffect(() => {
        setLogDateOverride(effectiveDate);
    }, [effectiveDate, setLogDateOverride]);

    useEffect(() => {
        return () => {
            setLogDateOverride(null);
        };
    }, [setLogDateOverride]);

    return (
        <Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' }
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%'
                    }}
                >
                    <Tooltip title={t('log.nav.prevDay')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.prevDay')}
                                onClick={() =>
                                    setSelectedDate(clampIsoDate(addDaysToIsoDate(effectiveDate, -1), dateBounds))
                                }
                                disabled={!canGoBack}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Box sx={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
                        <TextField
                            label={t('log.date.label')}
                            type="date"
                            value={effectiveDate}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{
                                min: dateBounds.min,
                                max: dateBounds.max,
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
                            value={effectiveDate}
                            min={dateBounds.min}
                            max={dateBounds.max}
                            tabIndex={-1}
                            aria-hidden="true"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const nextDate = e.target.value;
                                if (!nextDate) return;
                                setSelectedDate(clampIsoDate(nextDate, dateBounds));
                                dateOverlayButtonRef.current?.focus({ preventScroll: true });
                            }}
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0,
                                pointerEvents: 'none'
                            }}
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
                            aria-label={t('log.datePicker.aria', { date: effectiveDateLabel })}
                            onClick={() => showNativeDatePicker(datePickerInputRef.current)}
                            sx={(theme) => ({
                                position: 'absolute',
                                inset: 0,
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

                    <Tooltip title={t('log.nav.nextDay')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.nextDay')}
                                onClick={() => {
                                    const next = addDaysToIsoDate(effectiveDate, 1);
                                    setSelectedDate(clampIsoDate(next, dateBounds));
                                }}
                                disabled={!canGoForward}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Tooltip title={t('log.nav.jumpToToday')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.jumpToToday')}
                                onClick={() => setSelectedDate(dateBounds.max)}
                                disabled={effectiveDate === dateBounds.max}
                            >
                                <TodayIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>

            <Box
                sx={{
                    mt: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2,
                    alignItems: 'stretch'
                }}
            >
                <LogSummaryCard date={effectiveDate} />

                <WeightSummaryCard date={effectiveDate} onOpenWeightEntry={openWeightDialogForLogDate} />
            </Box>

            <AppCard sx={{ mt: 2 }}>
                {foodQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={() => void foodQuery.refetch()}>
                                {t('common.retry')}
                            </Button>
                        }
                    >
                        {t('log.foodLog.error')}
                    </Alert>
                ) : (
                    <FoodLogMeals logs={foodQuery.data ?? []} isLoading={foodQuery.isLoading} />
                )}
            </AppCard>
        </Box>
    );
};

export default Log;
