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
    Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';
import TimeZonePicker from '../components/TimeZonePicker';
import {
    parseUnitPreferenceKey,
    resolveUnitPreferenceKey,
    type UnitPreferenceKey
} from '../utils/unitPreferences';

/**
 * Settings is focused on device preferences (theme) and app preferences (units).
 */
const Settings: React.FC = () => {
    const { user, logout, updateUnitPreferences, updateTimezone } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const navigate = useNavigate();
    const [settingsMessage, setSettingsMessage] = useState('');
    const [accountMessage, setAccountMessage] = useState('');
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);
    const [unitPreference, setUnitPreference] = useState<UnitPreferenceKey>(() =>
        resolveUnitPreferenceKey({ weight_unit: user?.weight_unit, height_unit: user?.height_unit })
    );

    React.useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
        setUnitPreference(resolveUnitPreferenceKey({ weight_unit: user?.weight_unit, height_unit: user?.height_unit }));
    }, [detectedTimezone, user?.height_unit, user?.timezone, user?.weight_unit]);

    const handleUnitPreferenceChange = async (e: SelectChangeEvent) => {
        if (!user) {
            setSettingsMessage('Failed to update preferences');
            return;
        }

        const previousPreference = unitPreference;
        const nextPreference = e.target.value as UnitPreferenceKey;
        setUnitPreference(nextPreference);

        const { heightUnit, weightUnit } = parseUnitPreferenceKey(nextPreference);

        try {
            await updateUnitPreferences({ weight_unit: weightUnit, height_unit: heightUnit });
            setSettingsMessage('Preferences updated');
        } catch {
            setUnitPreference(previousPreference);
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

    /**
     * Clear the current session and return the user to the login screen.
     */
    const handleLogout = async () => {
        setAccountMessage('');
        try {
            await logout();
            navigate('/login');
        } catch {
            setAccountMessage('Failed to log out');
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Units & Localization
                </Typography>
                {settingsMessage && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        {settingsMessage}
                    </Alert>
                )}
                <FormControl fullWidth margin="normal">
                    <InputLabel>Units</InputLabel>
                    <Select value={unitPreference} label="Units" onChange={handleUnitPreferenceChange}>
                        <MenuItem value="CM_KG">Metric (cm, kg)</MenuItem>
                        <MenuItem value="FTIN_LB">Imperial (ft/in, lb)</MenuItem>
                        <MenuItem value="CM_LB">Mixed (cm, lb)</MenuItem>
                        <MenuItem value="FTIN_KG">Mixed (ft/in, kg)</MenuItem>
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
                <Typography variant="h6" gutterBottom>
                    Appearance
                </Typography>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Theme</InputLabel>
                    <Select value={themePreference} label="Theme" onChange={(e) => setThemePreference(e.target.value as ThemePreference)}>
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

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Account
                </Typography>
                {accountMessage && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {accountMessage}
                    </Alert>
                )}
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<LogoutIcon />}
                    onClick={() => void handleLogout()}
                    fullWidth
                >
                    Log out
                </Button>
            </Paper>
        </Box>
    );
};

export default Settings;
