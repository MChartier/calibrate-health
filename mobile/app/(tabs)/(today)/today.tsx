import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../../src/components/AddFoodSheet';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../../src/components/AsyncStateBoundary';
import { CalorieBalanceCard } from '../../../src/components/CalorieBalanceCard';
import { DateNavigation } from '../../../src/components/DateNavigation';
import { FoodLogSummaryCard } from '../../../src/components/FoodLogSummaryCard';
import { DayStatusCard, useFoodDayStatus } from '../../../src/components/FoodTrackingStatus';
import { LogContentSkeleton } from '../../../src/components/LogContentSkeleton';
import { TabScreen } from '../../../src/components/TabScreen';
import { TodayWeightCard } from '../../../src/components/TodayWeightCard';
import { WeightEntrySheet } from '../../../src/components/WeightEntrySheet';
import { useAuth } from '../../../src/auth/AuthContext';
import { useSharedLogDateNavigation } from '../../../src/context/LogDateContext';
import { useAddFoodRequest } from '../../../src/context/AddFoodRequestContext';
import { usePrefetchPreviousFoodLog } from '../../../src/hooks/usePrefetchPreviousFoodLog';
import { shouldEmphasizePausedStatus, shouldShowCalorieComparison } from '../../../src/food/dayPresentation';
import { getCaloriePlanPresentation } from '../../../src/caloriePlanning/presentation';
import { getActiveTabRoute } from '../../../src/navigation/contextualFab';
import { MEAL_OPTIONS } from '../../../src/utils/meals';
import { getTodayDate } from '../../../src/utils/dates';
import { getMetricDate } from '../../../src/utils/metrics';
import { usePendingWeightMutation } from '../../../src/offline/usePendingWeightMutation';
import { spacing } from '../../../src/theme';

export default function TodayScreen() {
    const routeParams = useLocalSearchParams<{ openAddFood?: string; date?: string; meal?: string }>();
    const pathname = usePathname();
    const { api, user } = useAuth();
    const dateNavigation = useSharedLogDateNavigation();
    const setLogDate = dateNavigation.setDate;
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const handledAddFoodRouteRef = React.useRef<string | null>(null);
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    const [isWeightSheetOpen, setIsWeightSheetOpen] = useState(false);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const foodDayQuery = useFoodDayStatus(selectedDate);
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });
    const isOnline = useOnlineStatus();
    const hasPendingWeightChange = usePendingWeightMutation();

    const dashboardQueries = [profileQuery, foodQuery, foodDayQuery, metricsQuery] as const;
    const failedDashboardQueries = dashboardQueries.filter((query) => query.isError);
    const allDashboardDataResolved = dashboardQueries.every((query) => query.data !== undefined);
    const failedResourcesHaveUsableCache = failedDashboardQueries.every((query) =>
        query.data != null && (!Array.isArray(query.data) || query.data.length > 0)
    );
    const dashboardHasUsableData = allDashboardDataResolved && failedResourcesHaveUsableCache;
    const dashboardState = useAsyncResourceState({
        data: dashboardHasUsableData ? true : undefined,
        status: failedDashboardQueries.length > 0
            ? 'error'
            : dashboardQueries.every((query) => query.status === 'success') ? 'success' : 'pending',
        fetchStatus: dashboardQueries.some((query) => query.fetchStatus === 'paused')
            ? 'paused'
            : dashboardQueries.some((query) => query.fetchStatus === 'fetching') ? 'fetching' : 'idle',
        error: failedDashboardQueries[0]?.error ?? null,
        dataUpdatedAt: dashboardHasUsableData ? 1 : 0,
        isPlaceholderData: dashboardQueries.some((query) => query.isPlaceholderData)
    }, () => false);
    const retryFailedDashboardResources = React.useCallback(async () => {
        await Promise.all(failedDashboardQueries.map((query) => query.refetch()));
    }, [failedDashboardQueries]);

    useEffect(() => {
        if (!addFoodRequest || getActiveTabRoute(pathname) !== 'today') return;
        const requestDate = addFoodRequest.date ?? selectedDate;
        if (requestDate !== selectedDate) {
            setLogDate(requestDate);
            return;
        }
        if (foodDayQuery.data?.status !== 'OPEN') return;
        setAddFoodMeal(addFoodRequest.meal ?? null);
        consumeAddFoodRequest(addFoodRequest.id);
    }, [addFoodRequest, consumeAddFoodRequest, foodDayQuery.data?.status, pathname, selectedDate, setLogDate]);

    useEffect(() => {
        if (routeParams.openAddFood !== 'true') {
            handledAddFoodRouteRef.current = null;
            return;
        }
        const routeRequestKey = `${routeParams.date ?? ''}|${routeParams.meal ?? ''}`;
        if (handledAddFoodRouteRef.current === routeRequestKey) return;
        const requestDate = typeof routeParams.date === 'string' ? routeParams.date : selectedDate;
        if (requestDate !== selectedDate) {
            setLogDate(requestDate);
            return;
        }
        if (foodDayQuery.data?.status !== 'OPEN') return;
        const requestedMeal = typeof routeParams.meal === 'string' && MEAL_OPTIONS.includes(routeParams.meal as MealPeriod)
            ? routeParams.meal as MealPeriod
            : null;
        setAddFoodMeal(requestedMeal);
        handledAddFoodRouteRef.current = routeRequestKey;
    }, [foodDayQuery.data?.status, routeParams.date, routeParams.meal, routeParams.openAddFood, selectedDate, setLogDate]);

    const entries = foodQuery.data ?? [];
    const calories = entries.reduce((total, entry) => total + entry.calories, 0);
    const calorieSummary = profileQuery.data?.calorieSummary;
    const planStatus = calorieSummary?.planStatus;
    const planIsAvailable = planStatus === 'available' && !hasPendingWeightChange;
    const target = planIsAvailable ? calorieSummary?.dailyCalorieTarget ?? null : null;
    const planPresentation = getCaloriePlanPresentation(calorieSummary?.planReasonCode, planStatus);
    function handlePlanAction() {
        if (planPresentation.actionKind === 'weight') {
            setIsWeightSheetOpen(true);
            return;
        }
        if (planPresentation.actionKind === 'profile') {
            router.push('/settings');
            return;
        }
        router.push({
            pathname: '/progress',
            params: { openPlanReview: 'true' }
        });
    }
    const selectedDateMetric = (metricsQuery.data ?? []).find((metric) => getMetricDate(metric) === selectedDate) ?? null;
    const isToday = selectedDate === getTodayDate(user?.timezone);
    const dayStatus = foodDayQuery.data;
    const isPaused = dayStatus?.status === 'PAUSED';
    const showCalorieComparison = shouldShowCalorieComparison({
        status: dayStatus?.status,
        isToday,
        hasFoodEntries: entries.length > 0
    });
    let unavailableLabel = 'Day unresolved';
    if (dayStatus?.status === 'INCOMPLETE') unavailableLabel = 'Incomplete day';
    if (!planIsAvailable) unavailableLabel = planStatus === 'requires_review' ? 'Plan needs review' : 'Target unavailable';
    if (hasPendingWeightChange) unavailableLabel = 'Rechecking target';
    const emphasizePausedStatus = shouldEmphasizePausedStatus({
        status: dayStatus?.status,
        isToday,
        hasFoodEntries: entries.length > 0,
        isContentLoading: dashboardState.kind === 'loading'
    });

    return (
        <TabScreen style={styles.screenContent}>
            <DateNavigation navigation={dateNavigation} />
            <AsyncStateBoundary
                state={dashboardState}
                resourceLabel="today's log"
                loading={<LogContentSkeleton />}
                empty={<LogContentSkeleton />}
                onRetry={isOnline && failedDashboardQueries.length > 0
                    ? retryFailedDashboardResources
                    : undefined}
                retrying={failedDashboardQueries.some((query) => query.isFetching)}
            >
                <>
                    {isPaused && (
                        <DayStatusCard
                            date={selectedDate}
                            isToday={isToday}
                            compact
                            expanded={emphasizePausedStatus}
                        />
                    )}
                    {!isPaused && (
                        <>
                            <CalorieBalanceCard
                                totalCalories={calories}
                                targetCalories={showCalorieComparison ? target : null}
                                unavailableLabel={unavailableLabel}
                                compact
                            />
                            {hasPendingWeightChange ? (
                                <AppCard>
                                    <AppText variant="subtitle">Weight change syncing</AppText>
                                    <AppText variant="muted">
                                        Calorie target and projection will return after the server rechecks your plan.
                                    </AppText>
                                </AppCard>
                            ) : !planIsAvailable && (
                                <AppCard>
                                    <AppText variant="subtitle">{planPresentation.title}</AppText>
                                    <AppText variant="muted">{planPresentation.message}</AppText>
                                    <AppButton
                                        title={planPresentation.actionLabel}
                                        variant="secondary"
                                        onPress={handlePlanAction}
                                    />
                                </AppCard>
                            )}
                        </>
                    )}

                    {(!isPaused || entries.length > 0) && (
                        <FoodLogSummaryCard
                            entries={entries}
                            trackingUnavailable={dayStatus?.status !== 'OPEN' && dayStatus?.status !== 'COMPLETE'}
                            onPress={() => router.push({ pathname: '/food-log', params: { date: selectedDate } })}
                            onAddFood={dayStatus?.status === 'OPEN' ? () => setAddFoodMeal(null) : undefined}
                            compact
                        />
                    )}

                    <TodayWeightCard
                        metric={selectedDateMetric}
                        weightUnit={user?.weight_unit}
                        isToday={isToday}
                        onPress={() => setIsWeightSheetOpen(true)}
                        compact
                    />
                    {!isPaused && (
                        <DayStatusCard
                            date={selectedDate}
                            isToday={isToday}
                            compact
                        />
                    )}
                </>
            </AsyncStateBoundary>
            <AddFoodSheet
                visible={addFoodMeal !== undefined && dayStatus?.status === 'OPEN'}
                date={selectedDate}
                initialMeal={addFoodMeal}
                returnTo="today"
                onClose={() => setAddFoodMeal(undefined)}
            />
            <WeightEntrySheet
                visible={isWeightSheetOpen}
                date={selectedDate}
                onClose={() => setIsWeightSheetOpen(false)}
            />
        </TabScreen>
    );
}

const styles = StyleSheet.create({
    screenContent: {
        flexGrow: 1,
        gap: spacing.md,
        paddingTop: spacing.md
    }
});
