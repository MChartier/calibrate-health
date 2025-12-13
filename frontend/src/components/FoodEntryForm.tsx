import React, { useState } from 'react';
import { Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import axios from 'axios';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

const FoodEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const [foodName, setFoodName] = useState('');
    const [calories, setCalories] = useState('');
    const [mealPeriod, setMealPeriod] = useState('Breakfast');

    const handleAddFood = async () => {
        const entryDate = date ? `${date}T12:00:00` : new Date();
        await axios.post('/api/food', {
            name: foodName,
            calories,
            meal_period: mealPeriod,
            date: entryDate
        });
        setFoodName('');
        setCalories('');
        onSuccess?.();
    };

    return (
        <Stack spacing={2}>
            <TextField
                label="Food Name"
                fullWidth
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
            />
            <TextField
                label="Calories"
                type="number"
                fullWidth
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
            />
            <FormControl fullWidth>
                <InputLabel>Meal Period</InputLabel>
                <Select value={mealPeriod} label="Meal Period" onChange={(e) => setMealPeriod(e.target.value)}>
                    <MenuItem value="Breakfast">Breakfast</MenuItem>
                    <MenuItem value="Morning Snack">Morning Snack</MenuItem>
                    <MenuItem value="Lunch">Lunch</MenuItem>
                    <MenuItem value="Afternoon Snack">Afternoon Snack</MenuItem>
                    <MenuItem value="Dinner">Dinner</MenuItem>
                    <MenuItem value="Evening Snack">Evening Snack</MenuItem>
                </Select>
            </FormControl>
            <Button
                variant="contained"
                onClick={handleAddFood}
                disabled={!foodName || !calories}
            >
                Add Food
            </Button>
        </Stack>
    );
};

export default FoodEntryForm;
