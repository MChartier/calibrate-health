import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Select,
    Stack
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useTransientStatus } from '../hooks/useTransientStatus';
import { useAuth } from '../context/useAuth';
import type { HeightUnit, WeightUnit } from '../context/authContext';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';
import TimeZonePicker from '../components/TimeZonePicker';
import UnitPreferenceToggles from '../components/UnitPreferenceToggles';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';

/**
 * Settings is focused on device preferences (theme) and app preferences (units).
 */
const Settings: React.FC = () => {
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;
    const { user, logout, updateUnitPreferences, updateTimezone } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const navigate = useNavigate();

    const { status: unitsStatus, showStatus: showUnitsStatus } = useTransientStatus();
    const { status: accountStatus, showStatus: showAccountStatus } = useTransientStatus();

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => user?.weight_unit ?? 'KG');
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(() => user?.height_unit ?? 'CM');

    useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
        setWeightUnit(user?.weight_unit ?? 'KG');
        setHeightUnit(user?.height_unit ?? 'CM');
    }, [detectedTimezone, user?.height_unit, user?.timezone, user?.weight_unit]);

    const handleWeightUnitChange = async (next: WeightUnit) => {
        if (!user) {
            showUnitsStatus('Failed to save changes', 'error');
            return;
        }

        const previous = weightUnit;
        setWeightUnit(next);

        try {
            await updateUnitPreferences({ weight_unit: next });
            showUnitsStatus('Changes saved', 'success');
        } catch {
            setWeightUnit(previous);
            showUnitsStatus('Failed to save changes', 'error');
        }
    };

    const handleHeightUnitChange = async (next: HeightUnit) => {
        if (!user) {
            showUnitsStatus('Failed to save changes', 'error');
            return;
        }

        const previous = heightUnit;
        setHeightUnit(next);

        try {
            await updateUnitPreferences({ height_unit: next });
            showUnitsStatus('Changes saved', 'success');
        } catch {
            setHeightUnit(previous);
            showUnitsStatus('Failed to save changes', 'error');
        }
    };

    const handleTimezoneChange = async (nextTimezone: string) => {
        setTimezoneValue(nextTimezone);
        try {
            await updateTimezone(nextTimezone);
            showUnitsStatus('Changes saved', 'success');
        } catch {
            showUnitsStatus('Failed to save changes', 'error');
        }
    };

    /**
     * Clear the current session and return the user to the login screen.
     */
    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch {
            showAccountStatus('Failed to log out', 'error');
        }
    };

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionGap} useFlexGap>
                <AppCard>
                    <SectionHeader title="Units & Localization" sx={{ mb: 0.5 }} />

                    <InlineStatusLine status={unitsStatus} sx={{ mb: 1 }} />

                    <Box sx={{ mt: 1 }}>
                        <UnitPreferenceToggles
                            weightUnit={weightUnit}
                            heightUnit={heightUnit}
                            onWeightUnitChange={(next) => void handleWeightUnitChange(next)}
                            onHeightUnitChange={(next) => void handleHeightUnitChange(next)}
                        />
                    </Box>

                    <Box sx={{ mt: 2 }}>
                        <TimeZonePicker
                            value={timezoneValue}
                            onChange={(next) => void handleTimezoneChange(next)}
                            helperText="Used to define your day boundaries for food and weight logs."
                        />
                    </Box>
                </AppCard>

                <AppCard>
                    <SectionHeader title="Appearance" sx={{ mb: 1.5 }} />

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
                </AppCard>

                <AppCard>
                    <SectionHeader title="Account" sx={{ mb: 0.5 }} />
                    <InlineStatusLine status={accountStatus} sx={{ mb: 1 }} />

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<LogoutIcon />}
                        onClick={() => void handleLogout()}
                        fullWidth
                    >
                        Log out
                    </Button>
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Settings;
