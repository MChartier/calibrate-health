import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';
import { useTransientStatus } from '../hooks/useTransientStatus';
import {
  fetchVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationSettings,
  useNotificationSettingsQuery
} from '../queries/notifications';
import {
  getPushSupportStatus,
  isBadgeSupported,
  urlBase64ToUint8Array,
  type PushSupportStatus
} from '../utils/notifications';

const CARD_STACK_GAP = 3; // Vertical spacing between notification sections.
const SECTION_STACK_GAP = 1.5; // Vertical spacing within each section.
const TOGGLE_ROW_GAP = 1; // Space between toggle rows.

type ReminderSettingKey = 'weight_reminder_enabled' | 'food_reminder_enabled' | 'badge_enabled';

/**
 * NotificationSettingsCard
 *
 * Lets users opt into push reminders and badge updates, with platform-aware fallbacks.
 */
const NotificationSettingsCard: React.FC = () => {
  const { t } = useI18n();
  const { status, showStatus, clearStatus } = useTransientStatus();
  const queryClient = useQueryClient();
  const settingsQuery = useNotificationSettingsQuery();
  const settings = settingsQuery.data;
  const [pushSupport, setPushSupport] = useState<PushSupportStatus>(() => getPushSupportStatus());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPushBusy, setIsPushBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [weightReminderEnabled, setWeightReminderEnabled] = useState(false);
  const [foodReminderEnabled, setFoodReminderEnabled] = useState(false);
  const [badgeEnabled, setBadgeEnabled] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setWeightReminderEnabled(settings.weight_reminder_enabled);
    setFoodReminderEnabled(settings.food_reminder_enabled);
    setBadgeEnabled(settings.badge_enabled);
  }, [settings]);

  const badgeSupported = useMemo(() => isBadgeSupported(), []);
  const pushToggleDisabled = !pushSupport.supported || pushSupport.requiresInstall || isPushBusy;

  useEffect(() => {
    setPushSupport(getPushSupportStatus());
  }, []);

  useEffect(() => {
    if (!pushSupport.supported) return;

    const syncSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          setIsSubscribed(false);
          return;
        }
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          setIsSubscribed(false);
          return;
        }

        const json = subscription.toJSON();
        if (!json || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setIsSubscribed(false);
          return;
        }

        await registerPushSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          user_agent: navigator.userAgent
        });

        setIsSubscribed(true);
      } catch {
        setIsSubscribed(false);
      }
    };

    void syncSubscription();
  }, [pushSupport.supported]);

  const pushSupportMessage = useMemo(() => {
    if (!pushSupport.supported) return t('settings.notificationsPushNotSupported');
    if (pushSupport.requiresInstall) return t('settings.notificationsPushInstallIos');
    if (pushSupport.permission === 'denied') return t('settings.notificationsPushBlocked');
    return null;
  }, [pushSupport.permission, pushSupport.requiresInstall, pushSupport.supported, t]);

  const remindersHint = t('settings.notificationsRemindersHint');

  const handleSettingToggle = async (key: ReminderSettingKey, nextValue: boolean) => {
    if (!settings) return;

    clearStatus();
    setIsSaving(true);

    const previous = {
      weight_reminder_enabled: weightReminderEnabled,
      food_reminder_enabled: foodReminderEnabled,
      badge_enabled: badgeEnabled
    };

    if (key === 'weight_reminder_enabled') setWeightReminderEnabled(nextValue);
    if (key === 'food_reminder_enabled') setFoodReminderEnabled(nextValue);
    if (key === 'badge_enabled') setBadgeEnabled(nextValue);

    try {
      const updated = await updateNotificationSettings({ [key]: nextValue });
      queryClient.setQueryData(['notification-settings'], updated);
      setWeightReminderEnabled(updated.weight_reminder_enabled);
      setFoodReminderEnabled(updated.food_reminder_enabled);
      setBadgeEnabled(updated.badge_enabled);
      showStatus(t('status.changesSaved'), 'success');
    } catch {
      setWeightReminderEnabled(previous.weight_reminder_enabled);
      setFoodReminderEnabled(previous.food_reminder_enabled);
      setBadgeEnabled(previous.badge_enabled);
      showStatus(t('status.failedToSaveChanges'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const enablePush = async () => {
    if (!pushSupport.supported || pushSupport.requiresInstall) {
      showStatus(
        pushSupport.requiresInstall ? t('settings.notificationsPushInstallIos') : t('settings.notificationsPushNotSupported'),
        'error'
      );
      return;
    }

    if (pushSupport.permission === 'denied') {
      showStatus(t('settings.notificationsPushBlocked'), 'error');
      return;
    }

    setIsPushBusy(true);
    clearStatus();

    try {
      const permission = await Notification.requestPermission();
      setPushSupport(getPushSupportStatus());

      if (permission !== 'granted') {
        showStatus(t('settings.notificationsPushBlocked'), 'error');
        return;
      }

      const publicKey = await fetchVapidPublicKey();
      const registration = await navigator.serviceWorker.getRegistration();

      if (!registration) {
        showStatus(t('settings.notificationsPushNotSupported'), 'error');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      const json = subscription.toJSON();
      if (!json || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Subscription missing keys');
      }

      try {
        await registerPushSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          user_agent: navigator.userAgent
        });
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }

      setIsSubscribed(true);
      showStatus(t('settings.notificationsPushEnabled'), 'success');
    } catch {
      showStatus(t('settings.notificationsPushEnableFailed'), 'error');
    } finally {
      setIsPushBusy(false);
    }
  };

  const disablePush = async () => {
    setIsPushBusy(true);
    clearStatus();

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setIsSubscribed(false);
        return;
      }
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const json = subscription.toJSON();
        await subscription.unsubscribe();
        if (json?.endpoint) {
          await unregisterPushSubscription(json.endpoint);
        }
      }

      setIsSubscribed(false);
      showStatus(t('settings.notificationsPushDisabled'), 'success');
    } catch {
      showStatus(t('settings.notificationsPushDisableFailed'), 'error');
    } finally {
      setIsPushBusy(false);
    }
  };

  const handlePushToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      void enablePush();
    } else {
      void disablePush();
    }
  };

  const remindersDisabled = isSaving || settingsQuery.isLoading || !settings;

  return (
    <AppCard>
      <SectionHeader
        title={t('settings.notificationsTitle')}
        subtitle={t('settings.notificationsDescription')}
        sx={{ mb: 0.5 }}
      />

      <InlineStatusLine status={status} sx={{ mb: 1 }} />

      <Stack spacing={CARD_STACK_GAP}>
        <Stack spacing={SECTION_STACK_GAP}>
          <Box>
            <Typography variant="subtitle1">{t('settings.notificationsPushTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('settings.notificationsPushDescription')}
            </Typography>
          </Box>

          {pushSupportMessage && <Alert severity="info">{pushSupportMessage}</Alert>}

          <FormControlLabel
            control={
              <Switch
                checked={isSubscribed}
                onChange={handlePushToggle}
                color="primary"
                disabled={pushToggleDisabled}
              />
            }
            label={t('settings.notificationsPushToggle')}
          />
        </Stack>

        <Stack spacing={SECTION_STACK_GAP}>
          <Box>
            <Typography variant="subtitle1">{t('settings.notificationsRemindersTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {remindersHint}
            </Typography>
          </Box>

          <Stack spacing={TOGGLE_ROW_GAP}>
            <FormControlLabel
              control={
                <Switch
                  checked={weightReminderEnabled}
                  onChange={(event) => void handleSettingToggle('weight_reminder_enabled', event.target.checked)}
                  color="primary"
                  disabled={remindersDisabled}
                />
              }
              label={t('settings.notificationsReminderWeight')}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={foodReminderEnabled}
                  onChange={(event) => void handleSettingToggle('food_reminder_enabled', event.target.checked)}
                  color="primary"
                  disabled={remindersDisabled}
                />
              }
              label={t('settings.notificationsReminderFood')}
            />
          </Stack>
        </Stack>

        <Stack spacing={SECTION_STACK_GAP}>
          <Box>
            <Typography variant="subtitle1">{t('settings.notificationsBadgeTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('settings.notificationsBadgeHint')}
            </Typography>
          </Box>

          {!badgeSupported && <Alert severity="info">{t('settings.notificationsBadgeUnsupported')}</Alert>}

          <FormControlLabel
            control={
              <Switch
                checked={badgeEnabled}
                onChange={(event) => void handleSettingToggle('badge_enabled', event.target.checked)}
                color="primary"
                disabled={remindersDisabled}
              />
            }
            label={t('settings.notificationsBadgeToggle')}
          />
        </Stack>
      </Stack>
    </AppCard>
  );
};

export default NotificationSettingsCard;
