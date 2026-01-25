import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { useFoodLogQuery } from '../queries/foodLog';
import { useMetricsQuery, toDatePart } from '../queries/metrics';
import { useNotificationSettingsQuery } from '../queries/notifications';
import { getTodayIsoDate } from '../utils/date';
import { isBadgeSupported, setAppBadgeCount } from '../utils/notifications';

/**
 * Keep the app badge aligned with today's incomplete logging status.
 */
export function useNotificationBadges(): void {
  const { user } = useAuth();
  const badgeSupported = useMemo(() => isBadgeSupported(), []);
  const settingsQuery = useNotificationSettingsQuery({ enabled: Boolean(user) });
  const settings = settingsQuery.data;
  const todayIso = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);

  const shouldLoadDayData = Boolean(user && settings?.badge_enabled && badgeSupported);
  const foodQuery = useFoodLogQuery(todayIso, { enabled: shouldLoadDayData });
  const metricsQuery = useMetricsQuery({ enabled: shouldLoadDayData });

  useEffect(() => {
    if (!badgeSupported) return;

    if (!user || !settings?.badge_enabled) {
      void setAppBadgeCount(null);
      return;
    }

    if (!foodQuery.isSuccess || !metricsQuery.isSuccess) {
      return;
    }

    const hasWeight = metricsQuery.data.some((metric) => toDatePart(metric.date) === todayIso);
    const hasFood = foodQuery.data.length > 0;

    let missingCount = 0;
    if (settings.weight_reminder_enabled && !hasWeight) missingCount += 1;
    if (settings.food_reminder_enabled && !hasFood) missingCount += 1;

    void setAppBadgeCount(missingCount > 0 ? missingCount : null);
  }, [
    badgeSupported,
    foodQuery.data,
    foodQuery.isSuccess,
    metricsQuery.data,
    metricsQuery.isSuccess,
    settings?.badge_enabled,
    settings?.food_reminder_enabled,
    settings?.weight_reminder_enabled,
    todayIso,
    user
  ]);
}
