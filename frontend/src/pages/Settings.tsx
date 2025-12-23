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
import TimeZonePicker from '../components/TimeZonePicker';

/**
 * Settings is focused on device preferences (theme) and app preferences (units).
 */
const Settings: React.FC = () => {
    const { user, updateWeightUnit, updateTimezone } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const [settingsMessage, setSettingsMessage] = useState('');
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);

    React.useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
    }, [detectedTimezone, user?.timezone]);

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

    const handleTimezoneChange = async (nextTimezone: string) => {
        setTimezoneValue(nextTimezone);
        try {
            await updateTimezone(nextTimezone);
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

                <Box sx={{ mt: 2 }}>
                    <TimeZonePicker
                        value={timezoneValue}
                        onChange={(next) => void handleTimezoneChange(next)}
                        helperText="Used to define your day boundaries for food and weight logs."
                    />
                </Box>
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
