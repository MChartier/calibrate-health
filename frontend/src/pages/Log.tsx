import React, { useEffect, useState } from 'react';
import {
    Box,
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

const Log: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchLogs = async () => {
        try {
            const foodRes = await axios.get('/api/food?date=' + new Date().toISOString());
            setLogs(foodRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const handleCloseModal = () => setIsModalOpen(false);

    return (
        <Box sx={{ mt: 1 }}>
            <Typography variant="h4" gutterBottom>
                Log
            </Typography>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6">Today&apos;s Food Log</Typography>
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
                            <WeightEntryForm onSuccess={fetchLogs} />
                        </Paper>

                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Track Food
                            </Typography>
                            <FoodEntryForm onSuccess={fetchLogs} />
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
