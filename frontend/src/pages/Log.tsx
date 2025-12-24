import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    TextField,
    Typography
} from '@mui/material';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import AddIcon from '@mui/icons-material/Add';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import axios from 'axios';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQuery } from '@tanstack/react-query';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import { useAuth } from '../context/useAuth';
import { formatDateToLocalDateString } from '../utils/date';

const Log: React.FC = () => {
    const { user } = useAuth();
    const timeZone = user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = useMemo(() => formatDateToLocalDateString(new Date(), timeZone), [timeZone]);
    const [selectedDate, setSelectedDate] = useState(today);
    const [isFoodDialogOpen, setIsFoodDialogOpen] = useState(false);
    const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);

    type FoodLogEntry = {
        id: number;
        meal_period: string;
        name: string;
        calories: number;
    };

    type MetricEntry = {
        id: number;
        date: string;
        weight?: number | null;
    };

    const foodQuery = useQuery({
        queryKey: ['food', selectedDate],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(selectedDate));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const weightQuery = useQuery({
        queryKey: ['metrics', selectedDate],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics', {
                params: { start: selectedDate, end: selectedDate }
            });
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    useEffect(() => {
        setSelectedDate((current) => (current > today ? today : current));
    }, [today]);

    const handleCloseFoodDialog = () => setIsFoodDialogOpen(false);
    const handleCloseWeightDialog = () => setIsWeightDialogOpen(false);

    const totalCalories = useMemo(
        () =>
            (foodQuery.data ?? []).reduce(
                (total, entry) => total + (typeof entry.calories === 'number' ? entry.calories : 0),
                0
            ),
        [foodQuery.data]
    );

    const selectedDateLabel = selectedDate === today ? 'Today' : selectedDate;
    const hasWeighIn = (weightQuery.data?.length ?? 0) > 0;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'flex-start' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    Log
                </Typography>
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
                    sx={{ width: { xs: '100%', sm: 200 } }}
                />
            </Box>

            <CalorieTargetBanner consumedCalories={totalCalories} selectedDateLabel={selectedDateLabel} />

            {!weightQuery.isLoading && !hasWeighIn && (
                <Alert
                    severity="info"
                    sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}
                    action={
                        <Button color="primary" variant="contained" onClick={() => setIsWeightDialogOpen(true)}>
                            Add weigh-in
                        </Button>
                    }
                >
                    <Box>
                        <Typography variant="subtitle1">No weigh-in logged for this day</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add your weight to keep progress and calorie math up to date.
                        </Typography>
                    </Box>
                </Alert>
            )}

            <Paper sx={{ p: 2 }}>
                <FoodLogMeals logs={foodQuery.data ?? []} />
            </Paper>

            <SpeedDial
                ariaLabel="Add entry"
                icon={<AddIcon />}
                sx={{ position: 'fixed', right: 24, bottom: 24 }}
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
                                void foodQuery.refetch();
                                void weightQuery.refetch();
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
