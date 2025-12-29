import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import AddIcon from '@mui/icons-material/AddRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import TodayIcon from '@mui/icons-material/TodayRounded';
import RestaurantIcon from '@mui/icons-material/RestaurantRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQueryClient } from '@tanstack/react-query';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightSummaryCard from '../components/WeightSummaryCard';
import { useAuth } from '../context/useAuth';
import {
    addDaysToIsoDate,
    clampIsoDate,
    formatDateToLocalDateString,
    formatIsoDateForDisplay,
    getTodayIsoDate
} from '../utils/date';
import { fetchFoodLog, foodLogQueryKey, useFoodLogQuery } from '../queries/foodLog';
import AppCard from '../ui/AppCard';

const LOG_FAB_DIAMETER_SPACING = 7; // Default MUI "large" Fab is 56px (7 * 8).
const LOG_FAB_CONTENT_CLEARANCE_SPACING = 2; // Extra room so bottom-row actions aren't tight against the FAB.
const LOG_FAB_BOTTOM_NAV_GAP_SPACING = 1; // Our FAB sits 8px above the reserved bottom-nav space on mobile.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_PX = 2; // Thickness of the keyboard focus ring on the date control overlay.
const LOG_DATE_PICKER_OVERLAY_FOCUS_OUTLINE_OFFSET_PX = 2; // Gap between the overlay outline and the field chrome.

const LOG_PAGE_BOTTOM_PADDING = {
    xs: LOG_FAB_DIAMETER_SPACING + LOG_FAB_CONTENT_CLEARANCE_SPACING + LOG_FAB_BOTTOM_NAV_GAP_SPACING,
    md: LOG_FAB_DIAMETER_SPACING + LOG_FAB_CONTENT_CLEARANCE_SPACING
} as const;

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
    const theme = useTheme();
    const isFoodDialogFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const { user } = useAuth();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const today = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const dateBounds = useMemo(() => {
        return getLogDateBounds({ todayIso: today, createdAtIso: user?.created_at, timeZone });
    }, [today, timeZone, user?.created_at]);

    const [selectedDate, setSelectedDate] = useState(() => today);
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
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

    const handleCloseFoodDialog = () => setIsFoodDialogOpen(false);
    const handleCloseWeightDialog = () => setIsWeightDialogOpen(false);

    return (
        <Box sx={{ pb: LOG_PAGE_BOTTOM_PADDING }}>
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
                    <Tooltip title="Previous day">
                        <span>
                            <IconButton
                                aria-label="Previous day"
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
                            label="Date"
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
                            aria-label={`Date: ${effectiveDate}. Activate to choose a different day.`}
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

                    <Tooltip title="Next day">
                        <span>
                            <IconButton
                                aria-label="Next day"
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

                    <Tooltip title="Jump to today">
                        <span>
                            <IconButton
                                aria-label="Jump to today"
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

                <WeightSummaryCard date={effectiveDate} onOpenWeightEntry={() => setIsWeightDialogOpen(true)} />
            </Box>

            <AppCard sx={{ mt: 2 }}>
                {foodQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={() => void foodQuery.refetch()}>
                                Retry
                            </Button>
                        }
                    >
                        Unable to load your food log for this day.
                    </Alert>
                ) : (
                    <FoodLogMeals logs={foodQuery.data ?? []} isLoading={foodQuery.isLoading} />
                )}
            </AppCard>

            <SpeedDial
                ariaLabel="Add entry"
                icon={<AddIcon />}
                sx={{ position: 'fixed', right: 24, bottom: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 24 } }}
            >
                <SpeedDialAction
                    key="add-food"
                    icon={<RestaurantIcon />}
                    tooltipTitle="Add Food"
                    onClick={() => setIsFoodDialogOpen(true)}
                />
                <SpeedDialAction
                    key="add-weight"
                    icon={<MonitorWeightIcon />}
                    tooltipTitle="Add Weight"
                    onClick={() => setIsWeightDialogOpen(true)}
                />
            </SpeedDial>

            <Dialog
                open={isFoodDialogOpen}
                onClose={handleCloseFoodDialog}
                fullScreen={isFoodDialogFullScreen}
                fullWidth={!isFoodDialogFullScreen}
                maxWidth={isFoodDialogFullScreen ? false : 'sm'}
                scroll="paper"
                PaperProps={{
                    sx: {
                        height: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                        maxHeight: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                        m: isFoodDialogFullScreen ? 0 : 2,
                        borderRadius: isFoodDialogFullScreen ? 0 : 2,
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                <DialogTitle>Track Food</DialogTitle>
                <DialogContent sx={{ flex: 1, overflowY: 'auto' }}>
                    <Box sx={{ mt: 1 }}>
                        <FoodEntryForm
                            date={effectiveDate}
                            onSuccess={() => {
                                void queryClient.invalidateQueries({ queryKey: ['food'] });
                                handleCloseFoodDialog();
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseFoodDialog}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={isWeightDialogOpen} onClose={handleCloseWeightDialog} fullWidth maxWidth="sm">
                <DialogTitle sx={{ position: 'relative', pr: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box component="span">Track Weight</Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            For {effectiveDateLabel} (the day you're viewing)
                        </Typography>
                    </Box>

                    <Tooltip title="Close">
                        <IconButton
                            aria-label="Close"
                            onClick={handleCloseWeightDialog}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <WeightEntryForm
                    date={effectiveDate}
                    onSuccess={() => {
                        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
                        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
                        void queryClient.invalidateQueries({ queryKey: ['profile'] });
                        handleCloseWeightDialog();
                    }}
                />
            </Dialog>
        </Box>
    );
};

export default Log;
