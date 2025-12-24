import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    Paper,
    Skeleton,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import axios from 'axios';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LogSummaryCard from '../components/LogSummaryCard';
import { useAuth } from '../context/useAuth';
import { addDaysToIsoDate, getTodayIsoDate } from '../utils/date';
import type { MealPeriod } from '../types/mealPeriod';

type FoodLogEntry = {
    id: number;
    meal_period: MealPeriod;
    name: string;
    calories: number;
};

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

const Log: React.FC = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const today = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    const [selectedDate, setSelectedDate] = useState(today);
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);

    const effectiveDate = selectedDate > today ? today : selectedDate;

    const foodQuery = useQuery({
        queryKey: ['food', effectiveDate],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(effectiveDate));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const metricQuery = useQuery({
        queryKey: ['metrics', effectiveDate],
        queryFn: async (): Promise<MetricEntry | null> => {
            const res = await axios.get('/api/metrics', { params: { start: effectiveDate, end: effectiveDate } });
            const metrics = Array.isArray(res.data) ? (res.data as MetricEntry[]) : [];
            return metrics[0] ?? null;
        }
    });

    const canGoForward = effectiveDate < today;

    const handleCloseFoodDialog = () => setIsFoodDialogOpen(false);
    const handleCloseWeightDialog = () => setIsWeightDialogOpen(false);

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
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    Log
                </Typography>

                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: { xs: '100%', sm: 'auto' },
                        justifyContent: { xs: 'flex-start', sm: 'flex-end' }
                    }}
                >
                    <Tooltip title="Previous day">
                        <IconButton
                            aria-label="Previous day"
                            onClick={() => setSelectedDate(addDaysToIsoDate(effectiveDate, -1))}
                        >
                            <ChevronLeftIcon />
                        </IconButton>
                    </Tooltip>

                    <TextField
                        label="Date"
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => {
                            const nextDate = e.target.value;
                            if (!nextDate) return;
                            setSelectedDate(nextDate > today ? today : nextDate);
                        }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ max: today }}
                        sx={{ width: { xs: '100%', sm: 200 } }}
                    />

                    <Tooltip title="Next day">
                        <span>
                            <IconButton
                                aria-label="Next day"
                                onClick={() => {
                                    const next = addDaysToIsoDate(effectiveDate, 1);
                                    setSelectedDate(next > today ? today : next);
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
                                onClick={() => setSelectedDate(today)}
                                disabled={effectiveDate === today}
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

                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        Weight
                    </Typography>

                    {metricQuery.isError ? (
                        <Alert severity="warning">Unable to load your weight entry for this day.</Alert>
                    ) : metricQuery.isLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Skeleton width="50%" />
                            <Skeleton width="30%" />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {metricQuery.data ? (
                                <Typography variant="body1">
                                    <strong>{metricQuery.data.weight}</strong> {user?.weight_unit === 'LB' ? 'lb' : 'kg'}
                                </Typography>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    No weigh-in yet for this day.
                                </Typography>
                            )}
                            <Button
                                variant="outlined"
                                onClick={() => setIsWeightDialogOpen(true)}
                                sx={{ alignSelf: 'flex-start' }}
                            >
                                {metricQuery.data ? 'Update weight' : 'Add weight'}
                            </Button>
                        </Box>
                    )}
                </Paper>
            </Box>

            <Paper sx={{ p: 2, mt: 2 }}>
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
                    <>
                        {foodQuery.isFetching && <LinearProgress sx={{ mb: 2 }} />}
                        <FoodLogMeals logs={foodQuery.data ?? []} />
                    </>
                )}
            </Paper>

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
                    <Paper sx={{ p: 2, mt: 1 }}>
                        <FoodEntryForm
                            date={effectiveDate}
                            onSuccess={() => {
                                void queryClient.invalidateQueries({ queryKey: ['food'] });
                                handleCloseFoodDialog();
                            }}
                        />
                    </Paper>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseFoodDialog}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={isWeightDialogOpen} onClose={handleCloseWeightDialog} fullWidth maxWidth="sm">
                <DialogTitle>Track Weight</DialogTitle>
                <DialogContent>
                    <Paper sx={{ p: 2, mt: 1 }}>
                        <WeightEntryForm
                            date={effectiveDate}
                            onSuccess={() => {
                                void queryClient.invalidateQueries({ queryKey: ['metrics'] });
                                void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
                                void queryClient.invalidateQueries({ queryKey: ['profile'] });
                                handleCloseWeightDialog();
                            }}
                        />
                    </Paper>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseWeightDialog}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Log;
