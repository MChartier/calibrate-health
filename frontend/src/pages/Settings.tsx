import React, { useEffect, useState } from 'react';
import {
    Box,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Select,
    Stack
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTransientStatus } from '../hooks/useTransientStatus';
import { useAuth } from '../context/useAuth';
import type { HeightUnit, WeightUnit } from '../context/authContext';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';
import AccountSecurityCard from '../components/AccountSecurityCard';
import ProfilePhotoCard from '../components/ProfilePhotoCard';
import TimeZonePicker from '../components/TimeZonePicker';
import UnitPreferenceToggles from '../components/UnitPreferenceToggles';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';
import { APP_LANGUAGES, DEFAULT_APP_LANGUAGE, type AppLanguage } from '../i18n/languages';
import { useI18n } from '../i18n/useI18n';

/**
 * Settings is focused on account management (photo/password) and app preferences (units/theme).
 */
const Settings: React.FC = () => {
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;
    const { t } = useI18n();
    const { user, updateUnitPreferences, updateTimezone, updateLanguage } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();

    const { status: unitsStatus, showStatus: showUnitsStatus } = useTransientStatus();

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => user?.weight_unit ?? 'KG');
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(() => user?.height_unit ?? 'CM');
    const [languageValue, setLanguageValue] = useState<AppLanguage>(() => user?.language ?? DEFAULT_APP_LANGUAGE);

    useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
        setWeightUnit(user?.weight_unit ?? 'KG');
        setHeightUnit(user?.height_unit ?? 'CM');
        setLanguageValue(user?.language ?? DEFAULT_APP_LANGUAGE);
    }, [detectedTimezone, user?.height_unit, user?.language, user?.timezone, user?.weight_unit]);

    const handleWeightUnitChange = async (next: WeightUnit) => {
        if (!user) {
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
            return;
        }

        const previous = weightUnit;
        setWeightUnit(next);

        try {
            await updateUnitPreferences({ weight_unit: next });
            showUnitsStatus(t('status.changesSaved'), 'success');
        } catch {
            setWeightUnit(previous);
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
        }
    };

    const handleHeightUnitChange = async (next: HeightUnit) => {
        if (!user) {
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
            return;
        }

        const previous = heightUnit;
        setHeightUnit(next);

        try {
            await updateUnitPreferences({ height_unit: next });
            showUnitsStatus(t('status.changesSaved'), 'success');
        } catch {
            setHeightUnit(previous);
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
        }
    };

    const handleTimezoneChange = async (nextTimezone: string) => {
        setTimezoneValue(nextTimezone);
        try {
            await updateTimezone(nextTimezone);
            showUnitsStatus(t('status.changesSaved'), 'success');
        } catch {
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
        }
    };

    const handleLanguageChange = async (nextLanguage: AppLanguage) => {
        if (!user) {
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
            return;
        }

        const previous = languageValue;
        setLanguageValue(nextLanguage);

        try {
            await updateLanguage(nextLanguage);
            showUnitsStatus(t('status.changesSaved'), 'success');
        } catch {
            setLanguageValue(previous);
            showUnitsStatus(t('status.failedToSaveChanges'), 'error');
        }
    };

    const resolvedThemeModeLabel = resolvedThemeMode === 'dark' ? t('themeMode.dark') : t('themeMode.light');

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionGap} useFlexGap>
                <ProfilePhotoCard description={t('settings.profilePhotoDescription')} />

                <AccountSecurityCard />

                <AppCard>
                    <SectionHeader title={t('settings.unitsAndLocalization')} sx={{ mb: 0.5 }} />

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
                        <FormControl fullWidth margin="normal">
                            <InputLabel>{t('settings.language')}</InputLabel>
                            <Select
                                value={languageValue}
                                label={t('settings.language')}
                                onChange={(e) => void handleLanguageChange(e.target.value as AppLanguage)}
                            >
                                <MenuItem value={APP_LANGUAGES.EN}>{t('language.en')}</MenuItem>
                                <MenuItem value={APP_LANGUAGES.ES}>{t('language.es')}</MenuItem>
                                <MenuItem value={APP_LANGUAGES.FR}>{t('language.fr')}</MenuItem>
                                <MenuItem value={APP_LANGUAGES.RU}>{t('language.ru')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    <Box sx={{ mt: 2 }}>
                        <TimeZonePicker
                            value={timezoneValue}
                            onChange={(next) => void handleTimezoneChange(next)}
                            helperText={t('settings.timezoneHelper')}
                        />
                    </Box>
                </AppCard>

                <AppCard>
                    <SectionHeader title={t('settings.appearance')} sx={{ mb: 1.5 }} />

                    <FormControl fullWidth margin="normal">
                        <InputLabel>{t('settings.theme')}</InputLabel>
                        <Select
                            value={themePreference}
                            label={t('settings.theme')}
                            onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
                        >
                            <MenuItem value="system">{t('themePreference.system')}</MenuItem>
                            <MenuItem value="light">{t('themePreference.light')}</MenuItem>
                            <MenuItem value="dark">{t('themePreference.dark')}</MenuItem>
                        </Select>
                        <FormHelperText>
                            {themePreference === 'system'
                                ? t('settings.themeHelper.system', { mode: resolvedThemeModeLabel })
                                : t('settings.themeHelper.persisted')}
                        </FormHelperText>
                    </FormControl>
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Settings;
