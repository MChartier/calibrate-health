import React, { useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import AddIcon from '@mui/icons-material/AddRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import TodayIcon from '@mui/icons-material/TodayRounded';
import RestaurantIcon from '@mui/icons-material/RestaurantRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';
import FoodLogMealsSkeleton from '../components/FoodLogMealsSkeleton';
import { useQueryClient } from '@tanstack/react-query';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightSummaryCard from '../components/WeightSummaryCard';
import { useAuth } from '../context/useAuth';
import { addDaysToIsoDate, clampIsoDate, formatDateToLocalDateString, getTodayIsoDate } from '../utils/date';
import { fetchFoodLog, foodLogQueryKey, useFoodLogQuery } from '../queries/foodLog';
import AppCard from '../ui/AppCard';

const LOG_FAB_DIAMETER_SPACING = 7; // Default MUI "large" Fab is 56px (7 * 8).
const LOG_FAB_CONTENT_CLEARANCE_SPACING = 2; // Extra room so bottom-row actions aren't tight against the FAB.
const LOG_FAB_BOTTOM_NAV_GAP_SPACING = 1; // Our FAB sits 8px above the reserved bottom-nav space on mobile.

const LOG_PAGE_BOTTOM_PADDING = {
    xs: LOG_FAB_DIAMETER_SPACING + LOG_FAB_CONTENT_CLEARANCE_SPACING + LOG_FAB_BOTTOM_NAV_GAP_SPACING,
    md: LOG_FAB_DIAMETER_SPACING + LOG_FAB_CONTENT_CLEARANCE_SPACING
} as const;

const Log: React.FC = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const today = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const dateBounds = useMemo(() => {
        const max = today;
        const createdAt = user?.created_at;
        if (!createdAt) return { min: max, max };
        const createdAtDate = new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) return { min: max, max };
        const minRaw = formatDateToLocalDateString(createdAtDate, timeZone);
        // Defensive: if clocks are skewed, ensure bounds stay sane.
        const min = minRaw > max ? max : minRaw;
        return { min, max };
    }, [today, timeZone, user?.created_at]);

    const [selectedDate, setSelectedDate] = useState(() => today);
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);

    useEffect(() => {
        setSelectedDate((prev) => {
            const clamped = clampIsoDate(prev, dateBounds);
            return clamped === prev ? prev : clamped;
        });
    }, [dateBounds]);

    const effectiveDate = clampIsoDate(selectedDate, dateBounds);

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

                    <TextField
                        label="Date"
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => {
                            const nextDate = e.target.value;
                            if (!nextDate) return;
                            setSelectedDate(clampIsoDate(nextDate, dateBounds));
                        }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ min: dateBounds.min, max: dateBounds.max }}
                        sx={{
                            flexGrow: 1,
                            minWidth: 0,
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
                ) : foodQuery.isLoading ? (
                    <FoodLogMealsSkeleton />
                ) : (
                    <FoodLogMeals logs={foodQuery.data ?? []} />
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

            <Dialog open={isFoodDialogOpen} onClose={handleCloseFoodDialog} fullWidth maxWidth="sm">
                <DialogTitle>Track Food</DialogTitle>
                <DialogContent>
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
                <DialogTitle>Track Weight</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 1 }}>
                        <WeightEntryForm
                            date={effectiveDate}
                            onSuccess={() => {
                                void queryClient.invalidateQueries({ queryKey: ['metrics'] });
                                void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
                                void queryClient.invalidateQueries({ queryKey: ['profile'] });
                                handleCloseWeightDialog();
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseWeightDialog}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Log;
