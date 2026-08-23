import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../../src/components/AddFoodSheet';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { AsyncStateBoundary, useOnlineStatus } from '../../../src/components/AsyncStateBoundary';
import { CalorieBalanceCard } from '../../../src/components/CalorieBalanceCard';
import { CardHeader } from '../../../src/components/CardHeader';
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
import { getTodayDate } from '../../../src/utils/dates';
import { getMetricDate } from '../../../src/utils/metrics';
import { usePendingWeightMutation } from '../../../src/offline/usePendingWeightMutation';
import { hasTodayDashboardFailure, resolveTodayDashboardState } from '../../../src/today/dashboardState';
import { useBarcodeSearchHandoff } from '../../../src/barcode/useBarcodeSearchHandoff';
import { spacing } from '../../../src/theme';

const TODAY_SUMMARY_GRID_BREAKPOINT = 840; // Mirrors the app shell's wide layout without compressing scaled text.

export default function TodayScreen() {
    const routeParams = useLocalSearchParams<{ openAddFood?: string; date?: string; meal?: string }>();
    const pathname = usePathname();
    const { api, user } = useAuth();
    const dateNavigation = useSharedLogDateNavigation();
    const setLogDate = dateNavigation.setDate;
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    const [isWeightSheetOpen, setIsWeightSheetOpen] = useState(false);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const foodDayQuery = useFoodDayStatus(selectedDate);
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });
    const isOnline = useOnlineStatus();
    const hasPendingWeightChange = usePendingWeightMutation();
    const { fontScale, width } = useWindowDimensions();
    const useSummaryGrid = width >= TODAY_SUMMARY_GRID_BREAKPOINT && fontScale < 1.6;

    const dashboardQueries = [profileQuery, foodQuery, foodDayQuery, metricsQuery] as const;
    const failedDashboardQueries = dashboardQueries.filter((query) => query.isError);
    const dashboardHasFailedResource = hasTodayDashboardFailure(dashboardQueries);
    const dashboardState = resolveTodayDashboardState(dashboardQueries, isOnline);
    const retryFailedDashboardResources = React.useCallback(async () => {
        await Promise.all(failedDashboardQueries.map((query) => query.refetch()));
    }, [failedDashboardQueries]);

    useEffect(() => {
        if (typeof routeParams.date === 'string' && routeParams.date !== selectedDate) {
            setLogDate(routeParams.date);
        }
    }, [routeParams.date, selectedDate, setLogDate]);

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

    useBarcodeSearchHandoff({
        params: routeParams,
        selectedDate,
        enabled: foodDayQuery.data?.status === 'OPEN',
        setDate: setLogDate,
        openSheet: setAddFoodMeal,
        scrubParams: (requestDate) => router.setParams({
            date: requestDate,
            meal: undefined,
            openAddFood: undefined
        })
    });

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
    if (isPaused) unavailableLabel = 'Tracking paused';
    const emphasizePausedStatus = shouldEmphasizePausedStatus({
        status: dayStatus?.status,
        isToday,
        hasFoodEntries: entries.length > 0,
        isContentLoading: dashboardState.kind === 'loading'
    });

    return (
        <TabScreen style={styles.screenContent}>
            <AsyncStateBoundary
                state={dashboardState}
                resourceLabel="today's log"
                loading={<LogContentSkeleton />}
                empty={<LogContentSkeleton />}
                onRetry={isOnline && failedDashboardQueries.length > 0
                    ? retryFailedDashboardResources
                    : undefined}
                retrying={failedDashboardQueries.some((query) => query.isFetching)}
                suppressStaleNotice
            >
                <>
                    <CalorieBalanceCard
                        totalCalories={calories}
                        targetCalories={showCalorieComparison ? target : null}
                        unavailableLabel={unavailableLabel}
                        compact
                    />
                    {isPaused && (
                        <DayStatusCard
                            date={selectedDate}
                            isToday={isToday}
                            failed={dashboardHasFailedResource}
                            compact
                            expanded={emphasizePausedStatus}
                        />
                    )}
                    {!isPaused && (
                        <>
                            {hasPendingWeightChange ? (
                                <AppCard density="compact">
                                    <CardHeader title="Weight change syncing" density="compact" />
                                    <AppText variant="muted">
                                        Calorie target and projection will return after the server rechecks your plan.
                                    </AppText>
                                </AppCard>
                            ) : !planIsAvailable && (
                                <AppCard density="compact">
                                    <CardHeader title={planPresentation.title} density="compact" />
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

                    <View style={[styles.summaryCards, useSummaryGrid && styles.summaryCardsWide]}>
                        {(!isPaused || entries.length > 0) && (
                            <View style={[styles.summaryCard, useSummaryGrid && styles.summaryCardWide]}>
                                <FoodLogSummaryCard
                                    entries={entries}
                                    trackingUnavailable={dayStatus?.status !== 'OPEN' && dayStatus?.status !== 'COMPLETE'}
                                    onPress={() => router.push({ pathname: '/food-log', params: { date: selectedDate } })}
                                    onAddFood={dayStatus?.status === 'OPEN' ? () => setAddFoodMeal(null) : undefined}
                                    compact
                                />
                            </View>
                        )}

                        <View style={[styles.summaryCard, useSummaryGrid && styles.summaryCardWide]}>
                            <TodayWeightCard
                                metric={selectedDateMetric}
                                weightUnit={user?.weight_unit}
                                isToday={isToday}
                                onPress={() => setIsWeightSheetOpen(true)}
                                compact
                            />
                        </View>
                    </View>
                    {!isPaused && (
                        <DayStatusCard
                            date={selectedDate}
                            isToday={isToday}
                            failed={dashboardHasFailedResource}
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
        paddingTop: 0
    },
    summaryCards: {
        width: '100%',
        gap: spacing.md
    },
    summaryCardsWide: {
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    summaryCard: {
        width: '100%',
        minWidth: 0
    },
    summaryCardWide: {
        flex: 1,
        width: 'auto'
    }
});
