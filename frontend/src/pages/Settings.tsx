import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    TextField,
    Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useAuth } from '../context/useAuth';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';

/**
 * Settings is focused on device preferences (theme) and app preferences (units).
 */
const Settings: React.FC = () => {
    const { user, updateWeightUnit, updateTimezone } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const [settingsMessage, setSettingsMessage] = useState('');
    const [timezoneInput, setTimezoneInput] = useState(() => user?.timezone ?? '');

    React.useEffect(() => {
        if (timezoneInput.trim().length > 0) return;
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        setTimezoneInput(user?.timezone ?? detected);
    }, [timezoneInput, user?.timezone]);

    const handleWeightUnitChange = async (e: SelectChangeEvent) => {
        const nextUnit = e.target.value;
        if (nextUnit !== 'KG' && nextUnit !== 'LB') {
            setSettingsMessage('Failed to update preferences');
            return;
        }

        try {
            await updateWeightUnit(nextUnit);
            setSettingsMessage('Preferences updated');
        } catch {
            setSettingsMessage('Failed to update preferences');
        }
    };

    const handleTimezoneSave = async () => {
        const trimmed = timezoneInput.trim();
        if (!trimmed) {
            setSettingsMessage('Timezone is required');
            return;
        }

        try {
            await updateTimezone(trimmed);
            setSettingsMessage('Timezone updated');
        } catch {
            setSettingsMessage('Failed to update timezone');
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>Settings</Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Units & Localization</Typography>
                {settingsMessage && <Alert severity="info" sx={{ mb: 2 }}>{settingsMessage}</Alert>}
                <FormControl fullWidth margin="normal">
                    <InputLabel>Weight Unit</InputLabel>
                    <Select value={user?.weight_unit ?? 'KG'} label="Weight Unit" onChange={handleWeightUnitChange}>
                        <MenuItem value="KG">Kilograms (kg)</MenuItem>
                        <MenuItem value="LB">Pounds (lb)</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    label="Timezone"
                    helperText="IANA timezone, e.g. America/Los_Angeles"
                    value={timezoneInput}
                    onChange={(e) => setTimezoneInput(e.target.value)}
                    margin="normal"
                    fullWidth
                />
                <Button variant="contained" onClick={() => void handleTimezoneSave()} sx={{ mt: 1 }}>
                    Save Timezone
                </Button>
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
