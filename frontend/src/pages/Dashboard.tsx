import React, { useState, useEffect } from 'react';
import { Typography, Box, Grid, Paper } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any[]>([]);
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [foodRes, metricRes] = await Promise.all([
                axios.get('/api/food?date=' + new Date().toISOString()),
                axios.get('/api/metrics')
            ]);
            setLogs(foodRes.data);
            setMetrics(metricRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const totalCalories = Array.isArray(logs) ? logs.reduce((acc, log) => acc + log.calories, 0) : 0;
    const currentWeight = metrics.length > 0 ? metrics[0].weight : 'N/A';

    console.log('Dashboard logs:', logs);

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>Dashboard</Typography>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Summary Today</Typography>
                        <Typography>Calories Consumed: {totalCalories}</Typography>
                        <Typography>
                            Current Weight: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${weightUnitLabel}` : 'N/A'}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Weight</Typography>
                        <Box sx={{ mt: 2 }}>
                            <WeightEntryForm onSuccess={fetchData} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Food</Typography>
                        <Box sx={{ mt: 2 }}>
                            <FoodEntryForm onSuccess={fetchData} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Today's Food Log</Typography>
                        <Box sx={{ mt: 2 }}>
                            <FoodLogMeals logs={logs} />
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
