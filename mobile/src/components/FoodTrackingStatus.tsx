import React, { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FoodLogDay, FoodLogDayStatus, FoodTrackingPause } from '@calibrate/api-client';
import { useAuth } from '../auth/AuthContext';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../offline/operations';
import { useOfflineOutbox } from '../offline/provider';
import { addDaysToDateOnly, getTodayDate } from '../utils/dates';
import { type AppTheme, useAppTheme } from '../theme';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { DatePickerField } from './DatePickerField';
import { SectionHeader } from './SectionHeader';

export const foodDayQueryKey = (date: string) => ['mobile-food-day', date] as const;
export const foodTrackingPauseQueryKey = ['mobile-food-tracking-pause'] as const;

function storedDay(date: string, status: FoodLogDayStatus): FoodLogDay {
    return {
        date,
        status,
        origin: 'USER',
        source: 'STORED',
        is_representative: status === 'COMPLETE',
        is_complete: status === 'COMPLETE',
        completed_at: null,
        updated_at: null
    };
}

function activePause(startsOn: string, expectedResumeOn: string | null): FoodTrackingPause {
    return {
        active: true,
        id: null,
        starts_on: startsOn,
        expected_resume_on: expectedResumeOn,
        resumed_on: null,
        started_at: null,
        resumed_at: null,
        materialized_through: startsOn,
        resume_confirmation_due: false
    };
}

function useRefreshTrackingState(date?: string) {
    const queryClient = useQueryClient();
    return async () => {
        await Promise.all([
            date ? queryClient.invalidateQueries({ queryKey: foodDayQueryKey(date) }) : Promise.resolve(),
            queryClient.invalidateQueries({ queryKey: foodTrackingPauseQueryKey }),
            queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] })
        ]);
    };
}

export function useFoodDayStatus(date: string, enabled = true) {
    const { api } = useAuth();
    return useQuery({
        queryKey: foodDayQueryKey(date),
        queryFn: () => api.getFoodDay(date),
        enabled
    });
}

export const DayStatusCard: React.FC<{
    date: string;
    isToday: boolean;
    compact?: boolean;
}> = ({ date, isToday, compact = false }) => {
    const { api } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const dayQuery = useFoodDayStatus(date);
    const refresh = useRefreshTrackingState(date);
    const [pauseSheetOpen, setPauseSheetOpen] = useState(false);
    const [expectedResumeOn, setExpectedResumeOn] = useState('');
    const [showExpectedDate, setShowExpectedDate] = useState(false);

    const setStatus = useMutation({
        mutationFn: (status: Exclude<FoodLogDayStatus, 'PAUSED'>) => {
            const payload = { date, status };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.SET_FOOD_DAY_STATUS,
                payload,
                execute: (operationId) => api.setFoodDayStatus(payload, operationId),
                enqueue
            });
        },
        onSuccess: async (result, status) => {
            const day = result.disposition === 'synced' ? result.value : storedDay(date, status);
            queryClient.setQueryData(foodDayQueryKey(date), day);
            await refresh();
        }
    });

    const startPause = useMutation({
        mutationFn: (resumeOn: string | null) => {
            const payload = { starts_on: date, expected_resume_on: resumeOn };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.START_FOOD_TRACKING_PAUSE,
                payload,
                execute: (operationId) => api.startFoodTrackingPause(payload, operationId),
                enqueue
            });
        },
        onSuccess: async (result, resumeOn) => {
            queryClient.setQueryData(foodDayQueryKey(date), {
                ...storedDay(date, 'PAUSED'),
                origin: 'PAUSE'
            });
            const pause = result.disposition === 'synced'
                ? result.value.pause
                : activePause(date, resumeOn);
            queryClient.setQueryData(foodTrackingPauseQueryKey, { pause });
            setPauseSheetOpen(false);
            setShowExpectedDate(false);
            setExpectedResumeOn('');
            await refresh();
        }
    });

    const resume = useMutation({
        mutationFn: () => {
            const payload = { resumed_on: date };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.RESUME_FOOD_TRACKING,
                payload,
                execute: (operationId) => api.resumeFoodTracking(payload, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            queryClient.setQueryData(foodDayQueryKey(date), storedDay(date, 'OPEN'));
            queryClient.setQueryData(foodTrackingPauseQueryKey, {
                pause: { ...activePause(date, null), active: false, starts_on: null, materialized_through: null }
            });
            await refresh();
        }
    });

    if (dayQuery.isLoading || !dayQuery.data) {
        return null;
    }

    const day = dayQuery.data;
    const useCompactOpenLayout = compact && isToday && day.status === 'OPEN';
    const isBusy = setStatus.isPending || startPause.isPending || resume.isPending;
    const error = dayQuery.error ?? setStatus.error ?? startPause.error ?? resume.error;
    let icon: React.ComponentProps<typeof Ionicons>['name'] = 'options-outline';
    let title = isToday ? 'Tracking options' : 'Resolve this day';
    let description = isToday
        ? 'Complete the day when the log is finished, or pause tracking when you are taking time off.'
        : 'This day remains unresolved until its calorie log represents the full day.';
    if (day.status === 'COMPLETE') {
        icon = 'checkmark-circle';
        title = 'Day complete';
        description = 'This is a signed-off full-day calorie record.';
    } else if (day.status === 'INCOMPLETE') {
        icon = 'alert-circle-outline';
        title = day.source === 'INFERRED_EMPTY' ? 'Tracking was not completed' : 'Day incomplete';
        description = day.source === 'INFERRED_EMPTY'
            ? 'No food was logged for this past day, so it is not treated as a zero-calorie day.'
            : 'Calories are shown as raw entries and are not treated as a complete day.';
    } else if (day.status === 'PAUSED') {
        icon = 'pause-circle';
        title = 'Calorie tracking paused';
        description = 'Food targets and reminders are paused. Your goal remains active, and you can still enter weight voluntarily.';
    } else if (!isToday) {
        icon = 'help-circle-outline';
        title = 'Day unresolved';
        description = 'This past day has some tracking data but was never signed off as complete or incomplete.';
    }

    return (
        <>
            <AppCard
                accessibilityLabel={`${title}. ${description}`}
                style={useCompactOpenLayout && styles.cardCompact}
            >
                {useCompactOpenLayout ? (
                    <AppText variant="label">Tracking options</AppText>
                ) : (
                    <View style={styles.heading}>
                        <View style={styles.icon}>
                            <Ionicons name={icon} size={24} color={theme.colors.primary} />
                        </View>
                        <View style={styles.copy}>
                            <AppText variant="subtitle">{title}</AppText>
                            <AppText variant="muted">{description}</AppText>
                        </View>
                    </View>
                )}

                {day.status === 'OPEN' && (
                    <View style={[styles.actions, useCompactOpenLayout && styles.actionsCompact]}>
                        <AppButton
                            title="Complete day"
                            accessibilityLabel="Complete day"
                            disabled={isBusy}
                            onPress={() => setStatus.mutate('COMPLETE')}
                            style={[styles.action, useCompactOpenLayout && styles.actionCompact]}
                            leftIcon={<Ionicons
                                name="checkmark-circle-outline"
                                size={18}
                                color={theme.colors.onPrimary}
                            />}
                        />
                        {isToday && (
                            <AppButton
                                title="Pause tracking"
                                variant="secondary"
                                disabled={isBusy}
                                onPress={() => setPauseSheetOpen(true)}
                                style={[styles.action, useCompactOpenLayout && styles.actionCompact]}
                                leftIcon={<Ionicons
                                    name="pause-circle-outline"
                                    size={18}
                                    color={theme.colors.primary}
                                />}
                            />
                        )}
                    </View>
                )}
                {(day.status === 'COMPLETE' || day.status === 'INCOMPLETE' || (day.status === 'PAUSED' && !isToday)) && (
                    <AppButton
                        title={day.status === 'COMPLETE' ? 'Edit or backfill' : 'Backfill this day'}
                        variant="secondary"
                        disabled={isBusy}
                        onPress={() => setStatus.mutate('OPEN')}
                    />
                )}
                {day.status === 'PAUSED' && isToday && (
                    <AppButton
                        title={resume.isPending ? 'Resuming...' : 'Resume tracking'}
                        disabled={isBusy}
                        onPress={() => resume.mutate()}
                    />
                )}
                {error && <AppText style={styles.error}>{error.message}</AppText>}
            </AppCard>

            <BottomSheetModal
                visible={pauseSheetOpen}
                onRequestClose={() => setPauseSheetOpen(false)}
            >
                <SectionHeader
                    title="Pause calorie tracking?"
                    description="Calorie tracking and all reminders will stop. Your goal remains active, and you can still enter weight whenever you want."
                />
                <AppButton
                    title={startPause.isPending ? 'Pausing...' : 'Until I resume'}
                    disabled={startPause.isPending}
                    onPress={() => startPause.mutate(null)}
                />
                <AppButton
                    title="Choose expected resume date"
                    variant="secondary"
                    onPress={() => setShowExpectedDate(true)}
                />
                {showExpectedDate && (
                    <>
                        <DatePickerField
                            label="Expected resume date"
                            value={expectedResumeOn}
                            minimumDate={addDaysToDateOnly(date, 1)}
                            fallbackDate={addDaysToDateOnly(date, 1)}
                            onChangeDate={setExpectedResumeOn}
                            helperText="This date will show a confirmation in the app. It will not resume tracking automatically."
                        />
                        <AppButton
                            title="Pause with this date"
                            disabled={!expectedResumeOn || startPause.isPending}
                            onPress={() => startPause.mutate(expectedResumeOn)}
                        />
                    </>
                )}
                <AppButton title="Cancel" variant="ghost" onPress={() => setPauseSheetOpen(false)} />
            </BottomSheetModal>
        </>
    );
};

export const ResumeTrackingPrompt: React.FC = () => {
    const { api, user } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const today = getTodayDate(user?.timezone);
    const pauseQuery = useQuery({
        queryKey: foodTrackingPauseQueryKey,
        queryFn: () => api.getFoodTrackingPause(),
        enabled: Boolean(user)
    });
    const [dismissedThisForeground, setDismissedThisForeground] = useState(false);
    const [showExtend, setShowExtend] = useState(false);
    const [customDate, setCustomDate] = useState('');

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            setDismissedThisForeground(false);
            void pauseQuery.refetch();
        });
        return () => subscription.remove();
    }, [pauseQuery.refetch]);

    const refresh = useRefreshTrackingState(today);
    const resume = useMutation({
        mutationFn: () => {
            const payload = { resumed_on: today };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.RESUME_FOOD_TRACKING,
                payload,
                execute: (operationId) => api.resumeFoodTracking(payload, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            queryClient.setQueryData(foodDayQueryKey(today), storedDay(today, 'OPEN'));
            setDismissedThisForeground(true);
            setShowExtend(false);
            await refresh();
        }
    });
    const extend = useMutation({
        mutationFn: (expectedResumeOn: string | null) => {
            const payload = { expected_resume_on: expectedResumeOn };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_TRACKING_PAUSE,
                payload,
                execute: (operationId) => api.updateFoodTrackingPause(payload, operationId),
                enqueue
            });
        },
        onSuccess: async (result, expectedResumeOn) => {
            const current = pauseQuery.data?.pause ?? activePause(today, expectedResumeOn);
            const pause = result.disposition === 'synced'
                ? result.value.pause
                : { ...current, expected_resume_on: expectedResumeOn, resume_confirmation_due: false };
            queryClient.setQueryData(foodTrackingPauseQueryKey, { pause });
            setDismissedThisForeground(true);
            setShowExtend(false);
            setCustomDate('');
            await refresh();
        }
    });

    const pause = pauseQuery.data?.pause;
    const visible = Boolean(
        pause?.active &&
        pause.resume_confirmation_due &&
        !dismissedThisForeground
    );
    const error = resume.error ?? extend.error;

    return (
        <BottomSheetModal
            visible={visible}
            onRequestClose={() => setDismissedThisForeground(true)}
        >
            {!showExtend ? (
                <>
                    <SectionHeader
                        title="Ready to resume tracking?"
                        description="Tracking stays paused until you confirm."
                    />
                    <AppButton
                        title={resume.isPending ? 'Resuming...' : 'Resume tracking'}
                        disabled={resume.isPending || extend.isPending}
                        onPress={() => resume.mutate()}
                    />
                    <AppButton
                        title="Extend pause"
                        variant="secondary"
                        disabled={resume.isPending || extend.isPending}
                        onPress={() => setShowExtend(true)}
                    />
                </>
            ) : (
                <>
                    <SectionHeader title="Extend pause" description="When should Calibrate ask again?" />
                    <AppButton
                        title="Tomorrow"
                        disabled={extend.isPending}
                        onPress={() => extend.mutate(addDaysToDateOnly(today, 1))}
                    />
                    <DatePickerField
                        label="Choose another date"
                        value={customDate}
                        minimumDate={addDaysToDateOnly(today, 1)}
                        fallbackDate={addDaysToDateOnly(today, 1)}
                        onChangeDate={setCustomDate}
                    />
                    <AppButton
                        title="Use chosen date"
                        variant="secondary"
                        disabled={!customDate || extend.isPending}
                        onPress={() => extend.mutate(customDate)}
                    />
                    <AppButton
                        title="Until I resume"
                        variant="secondary"
                        disabled={extend.isPending}
                        onPress={() => extend.mutate(null)}
                    />
                    <AppButton title="Back" variant="ghost" onPress={() => setShowExtend(false)} />
                </>
            )}
            {error && <AppText style={styles.error}>{error.message}</AppText>}
        </BottomSheetModal>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        cardCompact: {
            padding: theme.spacing.md,
            gap: theme.spacing.sm
        },
        heading: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing.md
        },
        icon: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primaryContainer
        },
        copy: {
            flex: 1,
            minWidth: 0,
            gap: theme.spacing.xs
        },
        actions: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.sm
        },
        actionsCompact: {
            flexWrap: 'nowrap'
        },
        action: {
            flexGrow: 1
        },
        actionCompact: {
            flex: 1,
            minWidth: 0,
            paddingHorizontal: theme.spacing.xs
        },
        error: {
            color: theme.colors.danger
        }
    });
}
