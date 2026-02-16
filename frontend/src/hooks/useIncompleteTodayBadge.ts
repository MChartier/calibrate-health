import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useFoodLogQuery } from '../queries/foodLog';
import { useMetricsQuery, toDatePart } from '../queries/metrics';
import { clearAppBadge, isBadgingSupported, setAppBadge } from '../utils/badging';
import { getTodayIsoDate } from '../utils/date';

const TODAY_ISO_REFRESH_INTERVAL_MS = 60 * 1000; // Poll for local-day rollover so badging updates across midnight.

/**
 * Keep the app badge in sync with today's incomplete logging state.
 */
export const useIncompleteTodayBadge = (): void => {
    const { user } = useAuth();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const [todayIso, setTodayIso] = useState(() => getTodayIsoDate(timeZone));

    useEffect(() => {
        setTodayIso(getTodayIsoDate(timeZone));

        const intervalId = window.setInterval(() => {
            const nextTodayIso = getTodayIsoDate(timeZone);
            setTodayIso((currentTodayIso) =>
                currentTodayIso === nextTodayIso ? currentTodayIso : nextTodayIso
            );
        }, TODAY_ISO_REFRESH_INTERVAL_MS);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [timeZone]);

    const foodQuery = useFoodLogQuery(todayIso, { enabled: Boolean(user) });
    const metricsQuery = useMetricsQuery({ enabled: Boolean(user) });

    useEffect(() => {
        if (!user) {
            void clearAppBadge();
            return;
        }

        if (!isBadgingSupported()) {
            void clearAppBadge();
            return;
        }

        if (foodQuery.isLoading || metricsQuery.isLoading) {
            return;
        }

        if (foodQuery.isError || metricsQuery.isError) {
            return;
        }

        const hasFoodLogs = (foodQuery.data?.length ?? 0) > 0;
        const hasWeightLog =
            metricsQuery.data?.some((metric) => toDatePart(metric.date) === todayIso) ?? false;
        const missingCount = (hasFoodLogs ? 0 : 1) + (hasWeightLog ? 0 : 1);

        if (missingCount === 0) {
            void clearAppBadge();
        } else {
            void setAppBadge(missingCount);
        }
    }, [
        foodQuery.data,
        foodQuery.isError,
        foodQuery.isLoading,
        metricsQuery.data,
        metricsQuery.isError,
        metricsQuery.isLoading,
        todayIso,
        user
    ]);
};
