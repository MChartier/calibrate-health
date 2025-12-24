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
    const { user, updateUnits, updateTimezone } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const [settingsMessage, setSettingsMessage] = useState('');
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);
    const [unitSystem, setUnitSystem] = useState<'METRIC' | 'IMPERIAL'>(() => user?.unit_system ?? 'METRIC');

    React.useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
        setUnitSystem(user?.unit_system ?? 'METRIC');
    }, [detectedTimezone, user?.timezone, user?.unit_system]);

    const handleUnitSystemChange = async (e: SelectChangeEvent) => {
        const nextSystem = e.target.value;
        if (nextSystem !== 'METRIC' && nextSystem !== 'IMPERIAL') {
            setSettingsMessage('Failed to update preferences');
            return;
        }
        setUnitSystem(nextSystem);

        try {
            await updateUnits({ unit_system: nextSystem, weight_unit: nextSystem === 'IMPERIAL' ? 'LB' : 'KG' });
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
                    <InputLabel>Unit System</InputLabel>
                    <Select value={unitSystem} label="Unit System" onChange={handleUnitSystemChange}>
                        <MenuItem value="METRIC">Metric (cm, kg)</MenuItem>
                        <MenuItem value="IMPERIAL">Imperial (ft/in, lb)</MenuItem>
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
