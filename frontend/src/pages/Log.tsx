import React, { useCallback, useEffect, useState } from 'react';
import {
    Box,
    TextField,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    Paper,
    Stack,
    Typography,
    Button
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';
import WeightEntryForm from '../components/WeightEntryForm';
import FoodEntryForm from '../components/FoodEntryForm';
import FoodLogMeals from '../components/FoodLogMeals';

function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const Log: React.FC = () => {
    const today = getLocalDateString(new Date());
    const [selectedDate, setSelectedDate] = useState(today);
    const [logs, setLogs] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = useCallback(async (date: string) => {
        try {
            const foodRes = await axios.get('/api/food?date=' + encodeURIComponent(`${date}T12:00:00`));
            setLogs(foodRes.data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        fetchLogs(selectedDate);
    }, [fetchLogs, selectedDate]);

    const handleCloseModal = () => setIsModalOpen(false);

    return (
        <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
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

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6">Food Log</Typography>
                <Box sx={{ mt: 2 }}>
                    <FoodLogMeals logs={logs} />
                </Box>
            </Paper>

            <Fab
                color="primary"
                aria-label="Add"
                onClick={() => setIsModalOpen(true)}
                sx={{ position: 'fixed', right: 24, bottom: 24 }}
            >
                <AddIcon />
            </Fab>

            <Dialog open={isModalOpen} onClose={handleCloseModal} fullWidth maxWidth="sm">
                <DialogTitle>Add</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Track Weight
                            </Typography>
                            <WeightEntryForm date={selectedDate} onSuccess={() => fetchLogs(selectedDate)} />
                        </Paper>

                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Track Food
                            </Typography>
                            <FoodEntryForm date={selectedDate} onSuccess={() => fetchLogs(selectedDate)} />
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseModal}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Log;
