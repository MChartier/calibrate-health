import React, { useState, useEffect } from 'react';
import { Typography, Box, Grid, Paper, TextField, Button, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import axios from 'axios';

const Dashboard: React.FC = () => {
    const [weight, setWeight] = useState('');
    const [foodName, setFoodName] = useState('');
    const [calories, setCalories] = useState('');
    const [mealPeriod, setMealPeriod] = useState('Breakfast');
    const [logs, setLogs] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any[]>([]);

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

    const handleAddWeight = async () => {
        try {
            await axios.post('/api/metrics', { weight });
            setWeight('');
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddFood = async () => {
        try {
            await axios.post('/api/food', {
                name: foodName,
                calories,
                meal_period: mealPeriod,
                date: new Date()
            });
            setFoodName('');
            setCalories('');
            fetchData();
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
                        <Typography>Current Weight: {currentWeight} kg</Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Weight</Typography>
                        <TextField
                            label="Weight (kg)"
                            type="number"
                            fullWidth
                            margin="normal"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                        />
                        <Button variant="contained" onClick={handleAddWeight}>Add Weight</Button>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Track Food</Typography>
                        <TextField
                            label="Food Name"
                            fullWidth
                            margin="normal"
                            value={foodName}
                            onChange={(e) => setFoodName(e.target.value)}
                        />
                        <TextField
                            label="Calories"
                            type="number"
                            fullWidth
                            margin="normal"
                            value={calories}
                            onChange={(e) => setCalories(e.target.value)}
                        />
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Meal Period</InputLabel>
                            <Select
                                value={mealPeriod}
                                label="Meal Period"
                                onChange={(e) => setMealPeriod(e.target.value)}
                            >
                                <MenuItem value="Breakfast">Breakfast</MenuItem>
                                <MenuItem value="Morning">Morning</MenuItem>
                                <MenuItem value="Lunch">Lunch</MenuItem>
                                <MenuItem value="Afternoon">Afternoon</MenuItem>
                                <MenuItem value="Dinner">Dinner</MenuItem>
                                <MenuItem value="Evening">Evening</MenuItem>
                            </Select>
                        </FormControl>
                        <Button variant="contained" onClick={handleAddFood}>Add Food</Button>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Today's Food Log</Typography>
                        {Array.isArray(logs) && logs.map((log) => (
                            <Box key={log.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #eee' }}>
                                <Typography>{log.meal_period}: {log.name}</Typography>
                                <Typography>{log.calories} kcal</Typography>
                            </Box>
                        ))}
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
