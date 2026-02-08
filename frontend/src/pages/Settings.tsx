import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormHelperText,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    Typography
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/DescriptionRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import { useTransientStatus } from '../hooks/useTransientStatus';
import { useAuth } from '../context/useAuth';
import type { HeightUnit, WeightUnit } from '../context/authContext';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';
import AccountSecurityCard from '../components/AccountSecurityCard';
import LoseItImportCard from '../components/imports/LoseItImportCard';
import ProfilePhotoCard from '../components/ProfilePhotoCard';
import TimeZonePicker from '../components/TimeZonePicker';
import UnitPreferenceToggles from '../components/UnitPreferenceToggles';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';
import { APP_LANGUAGES, DEFAULT_APP_LANGUAGE, type AppLanguage } from '../i18n/languages';
import { useI18n } from '../i18n/useI18n';
import { CALIBRATE_REPO_URL } from '../constants/links';
import { resolveServiceWorkerRegistration, urlBase64ToUint8Array } from '../utils/pushNotifications';

const ABOUT_PARAGRAPH_SPACING = 1.5; // Spacing between About card paragraphs.
const ABOUT_LINK_SPACING = 1; // Spacing between About card action buttons.
const IOS_USER_AGENT_REGEX = /iphone|ipad|ipod/i;

const isIosDevice = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent || '';
    const isIos = IOS_USER_AGENT_REGEX.test(userAgent);
    const isIpadOs = userAgent.includes('Mac') && navigator.maxTouchPoints > 1;
    return isIos || isIpadOs;
};

const isStandaloneDisplayMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (window.navigator as { standalone?: boolean }).standalone === true;
};

/**
 * Settings is focused on account management (photo/password) and app preferences (units/theme).
 */
const Settings: React.FC = () => {
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    // Tighter section spacing on small screens keeps settings cards readable without excess gaps.
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };
    const { t } = useI18n();
    const { user, updateUnitPreferences, updateTimezone, updateLanguage } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();

    const { status: unitsStatus, showStatus: showUnitsStatus } = useTransientStatus();
    const { status: remindersStatus, showStatus: showRemindersStatus } = useTransientStatus();

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [timezoneValue, setTimezoneValue] = useState(() => user?.timezone ?? detectedTimezone);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => user?.weight_unit ?? 'KG');
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(() => user?.height_unit ?? 'CM');
    const [languageValue, setLanguageValue] = useState<AppLanguage>(() => user?.language ?? DEFAULT_APP_LANGUAGE);
    const [remindersEnabled, setRemindersEnabled] = useState(false);
    const [isUpdatingReminders, setIsUpdatingReminders] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission;
    });

    const supportsNotifications = typeof window !== 'undefined' && 'Notification' in window;
    const supportsServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in navigator;
    const supportsPushManager = typeof window !== 'undefined' && 'PushManager' in window;
    const iosDevice = isIosDevice();
    const standaloneDisplayMode = isStandaloneDisplayMode();

    const reminderSupport = useMemo(() => {
        if (!supportsNotifications) {
            return { supported: false, message: t('settings.remindersUnsupportedNotifications') };
        }
        if (!supportsServiceWorker) {
            return { supported: false, message: t('settings.remindersUnsupportedServiceWorker') };
        }
        if (!supportsPushManager) {
            return { supported: false, message: t('settings.remindersUnsupportedPush') };
        }
        if (iosDevice && !standaloneDisplayMode) {
            return { supported: false, message: t('settings.remindersInstallRequired') };
        }
        if (notificationPermission === 'denied') {
            return { supported: false, message: t('settings.remindersPermissionDenied') };
        }
        return { supported: true, message: t('settings.remindersHelper') };
    }, [
        iosDevice,
        notificationPermission,
        standaloneDisplayMode,
        supportsNotifications,
        supportsPushManager,
        supportsServiceWorker,
        t
    ]);

    useEffect(() => {
        setTimezoneValue(user?.timezone ?? detectedTimezone);
        setWeightUnit(user?.weight_unit ?? 'KG');
        setHeightUnit(user?.height_unit ?? 'CM');
        setLanguageValue(user?.language ?? DEFAULT_APP_LANGUAGE);
    }, [detectedTimezone, user?.height_unit, user?.language, user?.timezone, user?.weight_unit]);

    const loadReminderSubscriptionStatus = useCallback(async () => {
        if (!supportsServiceWorker || !supportsPushManager) {
            setRemindersEnabled(false);
            return;
        }

        try {
            const registration = await resolveServiceWorkerRegistration();
            if (!registration) {
                setRemindersEnabled(false);
                return;
            }

            const subscription = await registration.pushManager.getSubscription();
            setRemindersEnabled(Boolean(subscription));
        } catch (err) {
            console.error(err);
            setRemindersEnabled(false);
        }
    }, [supportsPushManager, supportsServiceWorker]);

    useEffect(() => {
        void loadReminderSubscriptionStatus();
    }, [loadReminderSubscriptionStatus]);

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

    const handleRemindersToggle = useCallback(
        async (nextEnabled: boolean) => {
            if (!user) {
                showRemindersStatus(t('status.failedToSaveChanges'), 'error');
                return;
            }

            if (!reminderSupport.supported) {
                showRemindersStatus(reminderSupport.message, 'error');
                return;
            }

            const previous = remindersEnabled;
            setRemindersEnabled(nextEnabled);
            setIsUpdatingReminders(true);
            let shouldReloadReminderSubscriptionStatus = false;
            let subscribedBrowserEndpoint: string | null = null;
            let persistedSubscription = false;

            try {
                if (nextEnabled) {
                    const permission = await Notification.requestPermission();
                    setNotificationPermission(permission);

                    if (permission !== 'granted') {
                        setRemindersEnabled(false);
                        const message =
                            permission === 'denied'
                                ? t('settings.remindersPermissionDenied')
                                : t('settings.remindersPermissionRequired');
                        showRemindersStatus(message, 'error');
                        return;
                    }

                    const registration = await resolveServiceWorkerRegistration();
                    if (!registration) {
                        setRemindersEnabled(false);
                        showRemindersStatus(t('settings.remindersMissingServiceWorker'), 'error');
                        return;
                    }

                    const keyResponse = await axios.get('/api/notifications/public-key');
                    const publicKey = keyResponse.data?.publicKey;
                    if (!publicKey || typeof publicKey !== 'string') {
                        setRemindersEnabled(false);
                        showRemindersStatus(t('settings.remindersUpdateFailed'), 'error');
                        return;
                    }

                    const existingSubscription = await registration.pushManager.getSubscription();
                    const subscription =
                        existingSubscription ??
                        (await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(publicKey)
                        }));
                    subscribedBrowserEndpoint = subscription.endpoint;

                    await axios.post('/api/notifications/subscription', subscription.toJSON());
                    persistedSubscription = true;
                    shouldReloadReminderSubscriptionStatus = true;
                    setRemindersEnabled(true);
                    showRemindersStatus(t('settings.remindersEnabledStatus'), 'success');
                } else {
                    const registration = await resolveServiceWorkerRegistration();
                    const subscription = registration ? await registration.pushManager.getSubscription() : null;
                    if (subscription) {
                        await subscription.unsubscribe();
                        await axios.delete('/api/notifications/subscription', {
                            data: { endpoint: subscription.endpoint }
                        });
                    }
                    shouldReloadReminderSubscriptionStatus = true;
                    setRemindersEnabled(false);
                    showRemindersStatus(t('settings.remindersDisabledStatus'), 'success');
                }
            } catch (err) {
                console.error(err);
                if (nextEnabled && !persistedSubscription && subscribedBrowserEndpoint) {
                    // Keep local browser state aligned with server state when subscription save fails.
                    try {
                        const registration = await resolveServiceWorkerRegistration();
                        const subscription = registration ? await registration.pushManager.getSubscription() : null;
                        if (subscription && subscription.endpoint === subscribedBrowserEndpoint) {
                            await subscription.unsubscribe();
                        }
                    } catch (cleanupError) {
                        console.warn(
                            'Failed to clean up unsaved reminders subscription in this browser. Toggle reminders off and on to re-sync.',
                            cleanupError
                        );
                    }
                }
                setRemindersEnabled(previous);
                showRemindersStatus(t('settings.remindersUpdateFailed'), 'error');
            } finally {
                setIsUpdatingReminders(false);
                if (shouldReloadReminderSubscriptionStatus) {
                    void loadReminderSubscriptionStatus();
                }
            }
        },
        [
            loadReminderSubscriptionStatus,
            reminderSupport.message,
            reminderSupport.supported,
            remindersEnabled,
            showRemindersStatus,
            t,
            user
        ]
    );

    const resolvedThemeModeLabel = resolvedThemeMode === 'dark' ? t('themeMode.dark') : t('themeMode.light');

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionSpacing} useFlexGap>
                <ProfilePhotoCard description={t('settings.profilePhotoDescription')} />

                <AccountSecurityCard />

                <LoseItImportCard />

                <AppCard>
                    <Stack spacing={1.5} useFlexGap>
                        <SectionHeader title={t('settings.remindersTitle')} />

                        <Typography variant="body2" color="text.secondary">
                            {t('settings.remindersDescription')}
                        </Typography>

                        <InlineStatusLine status={remindersStatus} />

                        <FormControl>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={remindersEnabled}
                                        onChange={(e) => void handleRemindersToggle(e.target.checked)}
                                        disabled={!reminderSupport.supported || isUpdatingReminders}
                                    />
                                }
                                label={t('settings.remindersToggleLabel')}
                            />
                            <FormHelperText>{reminderSupport.message}</FormHelperText>
                        </FormControl>
                    </Stack>
                </AppCard>

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

                <AppCard>
                    <Stack spacing={2} useFlexGap>
                        <SectionHeader title={t('nav.about')} />

                        <Stack spacing={ABOUT_PARAGRAPH_SPACING} useFlexGap>
                            <Typography variant="body1">
                                calibrate is a calorie and weight-tracking app for people who want to lose or manage weight.
                                Log meals, track weigh-ins, and see daily targets, trends, and goal projections.
                            </Typography>
                            <Typography variant="body1">
                                Built for daily use, calibrate focuses on fast logging and clear, transparent math that helps
                                you stay consistent on mobile or desktop.
                            </Typography>
                            <Typography variant="body1">
                                We believe health tracking should be accessible and transparent. calibrate is free, ad-free,
                                open-source, and self-hostable so you can keep control of your data.
                            </Typography>
                            <Typography variant="body1">
                                We are focused on building a trustworthy tool that respects your privacy while making it
                                easier to stay on track day after day.
                            </Typography>
                            <Typography variant="body1">
                                Calibrate Health is not a medical service and does not provide medical advice.
                            </Typography>
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={ABOUT_LINK_SPACING} useFlexGap>
                            <Button
                                component={RouterLink}
                                to="/privacy"
                                variant="outlined"
                                startIcon={<DescriptionIcon />}
                            >
                                {t('legal.privacyPolicy')}
                            </Button>
                            <Button
                                component="a"
                                href={CALIBRATE_REPO_URL}
                                target="_blank"
                                rel="noreferrer"
                                variant="outlined"
                                startIcon={<GitHubIcon />}
                            >
                                {t('nav.github')}
                            </Button>
                        </Stack>
                    </Stack>
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Settings;
