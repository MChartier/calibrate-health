import React, { useState } from 'react';
import {
    Alert,
    Box,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useAuth } from '../context/useAuth';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';

/**
 * Settings is focused on device preferences (theme) and app preferences (units).
 *
 * Goal configuration lives on the Goals route.
 */
const Settings: React.FC = () => {
    const { user, updateWeightUnit } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const [unitMessage, setUnitMessage] = useState('');

    const handleWeightUnitChange = async (e: SelectChangeEvent) => {
        const nextUnit = e.target.value;
        if (nextUnit !== 'KG' && nextUnit !== 'LB') {
            setUnitMessage('Failed to update preferences');
            return;
        }

        try {
            await updateWeightUnit(nextUnit);
            setUnitMessage('Preferences updated');
        } catch {
            setUnitMessage('Failed to update preferences');
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>Settings</Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Units & Localization</Typography>
                {unitMessage && <Alert severity="info" sx={{ mb: 2 }}>{unitMessage}</Alert>}
                <FormControl fullWidth margin="normal">
                    <InputLabel>Weight Unit</InputLabel>
                    <Select value={user?.weight_unit ?? 'KG'} label="Weight Unit" onChange={handleWeightUnitChange}>
                        <MenuItem value="KG">Kilograms (kg)</MenuItem>
                        <MenuItem value="LB">Pounds (lb)</MenuItem>
                    </Select>
                </FormControl>
            </Paper>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Appearance</Typography>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Theme</InputLabel>
                    <Select
                        value={themePreference}
                        label="Theme"
                        onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
                    >
                        <MenuItem value="system">System</MenuItem>
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="dark">Dark</MenuItem>
                    </Select>
                    <FormHelperText>
                        {themePreference === 'system'
                            ? `Following your device setting (currently ${resolvedThemeMode}).`
                            : 'Persisted on this device.'}
                    </FormHelperText>
                </FormControl>
            </Paper>
        </Box>
    );
};

export default Settings;

