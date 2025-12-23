import React, { useState } from 'react';
import {
    Alert,
    Box,
    LinearProgress,
    Skeleton,
    TextField,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Typography,
    Button,
    IconButton,
    Tooltip
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
import { useQuery } from '@tanstack/react-query';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import { useAuth } from '../context/useAuth';
import { addDaysToIsoDate, getTodayIsoDate } from '../utils/date';
import { useUserProfileQuery } from '../queries/userProfile';

const Log: React.FC = () => {
    const { user } = useAuth();
    const today = getTodayIsoDate(user?.timezone);
    const [selectedDate, setSelectedDate] = useState(today);
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);

    type FoodLogEntry = {
        id: number;
        meal_period: string;
        name: string;
        calories: number;
    };

    const foodQuery = useQuery({
        queryKey: ['food', selectedDate],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(selectedDate));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const profileQuery = useUserProfileQuery();

    type MetricEntry = {
        id: number;
        date: string;
        weight: number;
    };

    const metricsQuery = useQuery({
        queryKey: ['metrics', selectedDate],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics', {
                params: { start: selectedDate, end: selectedDate }
            });
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const logs = foodQuery.data ?? [];
    const totalCalories = logs.reduce((sum, entry) => sum + entry.calories, 0);
    const dailyTarget = profileQuery.data?.calorieSummary?.dailyCalorieTarget;
    const hasTarget = typeof dailyTarget === 'number' && Number.isFinite(dailyTarget);
    const remainingCalories = hasTarget ? Math.round(dailyTarget - totalCalories) : null;
    const isOver = hasTarget ? totalCalories > dailyTarget : false;
    const progressPercent = hasTarget ? Math.min((totalCalories / dailyTarget) * 100, 100) : 0;
    const canGoForward = selectedDate < today;

    const handleCloseFoodDialog = () => setIsFoodDialogOpen(false);
    const handleCloseWeightDialog = () => setIsWeightDialogOpen(false);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
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
                            onClick={() => setSelectedDate(addDaysToIsoDate(selectedDate, -1))}
                        >
                            <ChevronLeftIcon />
                        </IconButton>
                    </Tooltip>

                    <TextField
                        label="Date"
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                            const nextDate = e.target.value;
                            if (!nextDate) return;
                            setSelectedDate(nextDate > today ? today : nextDate);
                        }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ max: today }}
                        sx={{ width: { xs: 160, sm: 200 } }}
                    />

                    <Tooltip title={canGoForward ? 'Next day' : 'Next day (disabled)'}>
                        <span>
                            <IconButton
                                aria-label="Next day"
                                disabled={!canGoForward}
                                onClick={() => setSelectedDate(addDaysToIsoDate(selectedDate, 1))}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Tooltip title="Jump to today">
                        <span>
                            <IconButton
                                aria-label="Jump to today"
                                disabled={selectedDate === today}
                                onClick={() => setSelectedDate(today)}
                            >
                                <TodayIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>

            <CalorieTargetBanner />

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" gutterBottom>
                        Daily Summary
                    </Typography>

                    {profileQuery.isError ? (
                        <Alert severity="warning">Unable to load your daily target right now.</Alert>
                    ) : profileQuery.isLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Skeleton width="60%" />
                            <Skeleton variant="rounded" height={10} />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                    Consumed: <strong>{totalCalories}</strong> kcal
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Target: <strong>{hasTarget ? Math.round(dailyTarget) : '—'}</strong> kcal
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: (theme) =>
                                            isOver ? theme.palette.error.main : theme.palette.text.secondary
                                    }}
                                >
                                    {remainingCalories !== null ? (
                                        isOver ? (
                                            <>
                                                Over: <strong>{Math.abs(remainingCalories)}</strong> kcal
                                            </>
                                        ) : (
                                            <>
                                                Remaining: <strong>{remainingCalories}</strong> kcal
                                            </>
                                        )
                                    ) : (
                                        <>
                                            Remaining: <strong>—</strong>
                                        </>
                                    )}
                                </Typography>
                            </Box>

                            {hasTarget ? (
                                <LinearProgress
                                    variant="determinate"
                                    value={progressPercent}
                                    sx={{
                                        height: 10,
                                        borderRadius: 6,
                                        '& .MuiLinearProgress-bar': {
                                            backgroundColor: (theme) =>
                                                isOver ? theme.palette.error.main : theme.palette.primary.main
                                        }
                                    }}
                                />
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    Complete your profile and goal to unlock daily targets.
                                </Typography>
                            )}
                        </Box>
                    )}
                </Paper>

                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" gutterBottom>
                        Weight
                    </Typography>

                    {metricsQuery.isError ? (
                        <Alert severity="warning">Unable to load your weight entry for this day.</Alert>
                    ) : metricsQuery.isLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Skeleton width="50%" />
                            <Skeleton width="30%" />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {metricsQuery.data?.[0] ? (
                                <Typography variant="body1">
                                    <strong>{metricsQuery.data[0].weight}</strong> {user?.weight_unit === 'LB' ? 'lb' : 'kg'}
                                </Typography>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    No weigh-in yet for this day.
                                </Typography>
                            )}
                            <Button variant="outlined" onClick={() => setIsWeightDialogOpen(true)} sx={{ alignSelf: 'flex-start' }}>
                                {metricsQuery.data?.[0] ? 'Update weight' : 'Add weight'}
                            </Button>
                        </Box>
                    )}
                </Paper>
            </Box>

            <Paper sx={{ p: 2 }}>
                {foodQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => void foodQuery.refetch()}
                            >
                                Retry
                            </Button>
                        }
                    >
                        Unable to load your food log for this day.
                    </Alert>
                ) : foodQuery.isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Skeleton width="30%" />
                        <Skeleton variant="rounded" height={44} />
                        <Skeleton variant="rounded" height={44} />
                        <Skeleton variant="rounded" height={44} />
                    </Box>
                ) : (
                    <FoodLogMeals date={selectedDate} logs={foodQuery.data ?? []} onChange={() => void foodQuery.refetch()} />
                )}
            </Paper>

            <SpeedDial
                ariaLabel="Add entry"
                icon={<AddIcon />}
                sx={{
                    position: 'fixed',
                    right: 24,
                    bottom: { xs: 88, md: 24 },
                    zIndex: (t) => t.zIndex.appBar + 1
                }}
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
                            date={selectedDate}
                            onSuccess={() => {
                                void foodQuery.refetch();
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
                            date={selectedDate}
                            onSuccess={() => {
                                void metricsQuery.refetch();
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
