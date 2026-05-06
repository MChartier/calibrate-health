import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import {
    addDaysToIsoDate,
    clampIsoDate,
    formatDateToLocalDateString,
    formatIsoDateForDisplay,
    getTodayIsoDate
} from '../utils/date';
import { fetchFoodLog, foodLogQueryKey } from '../queries/foodLog';

type LogDateBounds = { min: string; max: string };

export const LOG_DATE_QUERY_PARAM = 'date';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type LogDateNavigationResult = {
    selectedDate: string;
    selectedDateLabel: string;
    today: string;
    timeZone: string;
    navigation: LogDateNavigationState;
};

/**
 * Compute inclusive local-day bounds for date navigation.
 *
 * Lower bound: the user's account creation day so the date picker stays useful.
 * Upper bound: today in the user's timezone so future days cannot be logged accidentally.
 */
function getLogDateBounds(args: { todayIso: string; createdAtIso?: string; timeZone: string }): LogDateBounds {
    const max = args.todayIso;
    const createdAt = args.createdAtIso;
    if (!createdAt) return { min: max, max };

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) return { min: max, max };

    const minRaw = formatDateToLocalDateString(createdAtDate, args.timeZone);
    return { min: minRaw > max ? max : minRaw, max };
}

/**
 * Read a route-level date param only when it has the app's date-only shape.
 */
function getRouteDateParam(searchParams: URLSearchParams): string | null {
    const rawDate = searchParams.get(LOG_DATE_QUERY_PARAM);
    if (!rawDate || !DATE_ONLY_PATTERN.test(rawDate)) return null;
    return rawDate;
}

/**
 * Shared local-day navigation state for Today and Log views.
 */
export function useLogDateNavigationState(): LogDateNavigationResult {
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const today = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const dateBounds = useMemo(() => {
        return getLogDateBounds({ todayIso: today, createdAtIso: user?.created_at, timeZone });
    }, [today, timeZone, user?.created_at]);

    const routeDate = useMemo(() => getRouteDateParam(searchParams), [searchParams]);
    const [selectedDate, setSelectedDate] = useState(() => routeDate ?? today);

    useEffect(() => {
        setSelectedDate((prev) => {
            const clamped = clampIsoDate(routeDate ?? prev, dateBounds);
            return clamped === prev ? prev : clamped;
        });
    }, [dateBounds, routeDate]);

    const effectiveDate = clampIsoDate(selectedDate, dateBounds);
    const effectiveDateLabel = useMemo(() => formatIsoDateForDisplay(effectiveDate), [effectiveDate]);

    useEffect(() => {
        const rawRouteDate = searchParams.get(LOG_DATE_QUERY_PARAM);
        const nextParams = new URLSearchParams(searchParams);

        if (effectiveDate === today) {
            if (!rawRouteDate) return;
            nextParams.delete(LOG_DATE_QUERY_PARAM);
            setSearchParams(nextParams, { replace: true });
            return;
        }

        if (rawRouteDate === effectiveDate) return;
        nextParams.set(LOG_DATE_QUERY_PARAM, effectiveDate);
        setSearchParams(nextParams, { replace: true });
    }, [effectiveDate, searchParams, setSearchParams, today]);

    useEffect(() => {
        const prevDate = addDaysToIsoDate(effectiveDate, -1);
        if (prevDate >= dateBounds.min) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(prevDate),
                queryFn: () => fetchFoodLog(prevDate)
            });
        }

        const nextDate = addDaysToIsoDate(effectiveDate, 1);
        if (nextDate <= dateBounds.max) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(nextDate),
                queryFn: () => fetchFoodLog(nextDate)
            });
        }
    }, [dateBounds.max, dateBounds.min, effectiveDate, queryClient]);

    const applyClampedDate = useCallback(
        (nextDate: string) => {
            setSelectedDate(clampIsoDate(nextDate, dateBounds));
        },
        [dateBounds]
    );

    const goToPreviousDate = useCallback(() => {
        applyClampedDate(addDaysToIsoDate(effectiveDate, -1));
    }, [applyClampedDate, effectiveDate]);

    const goToNextDate = useCallback(() => {
        applyClampedDate(addDaysToIsoDate(effectiveDate, 1));
    }, [applyClampedDate, effectiveDate]);

    const goToToday = useCallback(() => {
        applyClampedDate(dateBounds.max);
    }, [applyClampedDate, dateBounds.max]);

    const navigation = useMemo<LogDateNavigationState>(
        () => ({
            date: effectiveDate,
            dateLabel: effectiveDateLabel,
            minDate: dateBounds.min,
            maxDate: dateBounds.max,
            canGoBack: effectiveDate > dateBounds.min,
            canGoForward: effectiveDate < dateBounds.max,
            goToPreviousDate,
            goToNextDate,
            goToToday,
            setDate: applyClampedDate
        }),
        [
            applyClampedDate,
            dateBounds.max,
            dateBounds.min,
            effectiveDate,
            effectiveDateLabel,
            goToNextDate,
            goToPreviousDate,
            goToToday
        ]
    );

    return {
        selectedDate: effectiveDate,
        selectedDateLabel: effectiveDateLabel,
        today,
        timeZone,
        navigation
    };
}
