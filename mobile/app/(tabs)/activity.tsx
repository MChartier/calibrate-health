import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ACTIVITY_RECORD_TYPES, WEIGHT_UNITS } from '@calibrate/shared';
import type { ActivityRecordEntry } from '@calibrate/api-client';
import { formatActivitySource } from '../../src/activity/presentation';
import { ActivitySummaryCard } from '../../src/components/ActivitySummaryCard';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../src/components/AsyncStateBoundary';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { DateNavigation } from '../../src/components/DateNavigation';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TabScreen } from '../../src/components/TabScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { useLogDateNavigation } from '../../src/hooks/useLogDateNavigation';
import { usePendingWeightMutation } from '../../src/offline/usePendingWeightMutation';
import { radius, spacing, useAppTheme, type AppTheme } from '../../src/theme';
import { addDaysToDateOnly, formatDateOnlyForDisplay } from '../../src/utils/dates';
import { gramsToDisplayWeight } from '../../src/utils/bodyMeasurements';
import { formatNumber, formatWeightUnit } from '../../src/utils/format';

const HISTORY_DAY_COUNT = 14; // Keep the history useful on a phone without downloading the user's full activity archive.

function formatDuration(record: ActivityRecordEntry): string {
    if (!record.end_time) return 'Duration unavailable';
    const start = new Date(record.start_time);
    const end = new Date(record.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Duration unavailable';
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    return `${minutes.toLocaleString()} min`;
}

function formatExerciseTime(record: ActivityRecordEntry): string {
    const start = new Date(record.start_time);
    if (Number.isNaN(start.getTime())) return record.start_time;
    return start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { date } = useLocalSearchParams<{ date?: string }>();
    const { api, user } = useAuth();
    const navigation = useLogDateNavigation(typeof date === 'string' ? date : null);
    const historyStart = useMemo(() => {
        const candidate = addDaysToDateOnly(navigation.today, -(HISTORY_DAY_COUNT - 1));
        return candidate < navigation.minDate ? navigation.minDate : candidate;
    }, [navigation.minDate, navigation.today]);
    const selectedQuery = useQuery({
        queryKey: ['mobile-activity-days', navigation.selectedDate, navigation.selectedDate],
        queryFn: () => api.getActivityDays({ start: navigation.selectedDate, end: navigation.selectedDate })
    });
    const historyQuery = useQuery({
        queryKey: ['mobile-activity-days', historyStart, navigation.today],
        queryFn: () => api.getActivityDays({ start: historyStart, end: navigation.today })
    });
    const profileQuery = useQuery({
        queryKey: ['mobile-profile'],
        queryFn: () => api.getUserProfile()
    });
    const isOnline = useOnlineStatus();
    const hasPendingWeightChange = usePendingWeightMutation();
    const selectedState = useAsyncResourceState(selectedQuery, (data) => data.days.length === 0);
    const historyState = useAsyncResourceState(historyQuery, (data) => data.days.length === 0);
    const profileState = useAsyncResourceState(profileQuery, () => false);
    const selectedDay = selectedQuery.data?.days[0];
    const exerciseRecords = (selectedDay?.records ?? []).filter(
        (record) => record.record_type === ACTIVITY_RECORD_TYPES.EXERCISE_SESSION
    );
    const weightRecords = (selectedDay?.records ?? []).filter(
        (record) => record.record_type === ACTIVITY_RECORD_TYPES.WEIGHT && record.weight_grams !== null
    );
    const sourceRecords = selectedDay?.records ?? [];
    const sourceLabels = Array.from(new Set(sourceRecords.map((record) => formatActivitySource(record.data_origin))));
    const historyDays = (historyQuery.data?.days ?? []).slice().reverse();

    return (
        <TabScreen>
            <DateNavigation navigation={navigation} />
            <AsyncStateBoundary
                state={profileState}
                resourceLabel="profile calorie estimate"
                loading={null}
                empty={null}
                onRetry={isOnline ? () => profileQuery.refetch() : undefined}
                retrying={profileQuery.isFetching}
            >
                {null}
            </AsyncStateBoundary>

            <AsyncStateBoundary
                state={selectedState}
                resourceLabel="selected-day activity"
                loading={(
                    <>
                        <ActivitySummaryCard day={undefined} isToday={navigation.isToday} isLoading />
                        <AppCard>
                            <SectionHeader title="Exercise details" description="Sessions imported for the selected day." />
                            <AppText variant="muted">Loading selected-day activity...</AppText>
                        </AppCard>
                    </>
                )}
                empty={(
                    <>
                        <ActivitySummaryCard day={undefined} isToday={navigation.isToday} />
                        <AppCard>
                            <SectionHeader title="Exercise details" description="Sessions imported for the selected day." />
                            <AppText variant="muted">No exercise sessions were imported for this day.</AppText>
                        </AppCard>
                        <AppCard>
                            <SectionHeader
                                title="Imported weight"
                                description="Read-only Health Connect readings for this day. They do not overwrite manual weigh-ins."
                            />
                            <AppText variant="muted">
                                No Health Connect weight readings were imported for this day. Weight access is optional and off by default.
                            </AppText>
                            <AppText variant="muted">
                                Imported readings are preserved with their source for review and export. Log a manual weigh-in to update Calibrate's weight trend.
                            </AppText>
                        </AppCard>
                    </>
                )}
                onRetry={isOnline ? () => selectedQuery.refetch() : undefined}
                retrying={selectedQuery.isFetching}
            >
                <>
                    <ActivitySummaryCard
                        day={selectedDay}
                        isToday={navigation.isToday}
                        profileTdee={!hasPendingWeightChange && profileQuery.data?.calorieSummary.eligibility?.status === 'eligible'
                            ? profileQuery.data.calorieSummary.tdee
                            : undefined}
                    />

                    <AppCard>
                        <SectionHeader title="Exercise details" description="Sessions imported for the selected day." />
                        {exerciseRecords.length === 0 ? (
                            <AppText variant="muted">No exercise sessions were imported for this day.</AppText>
                        ) : exerciseRecords.map((record) => (
                            <View key={record.id} style={styles.exerciseRow}>
                                <View style={styles.exerciseIcon}>
                                    <Ionicons name="fitness-outline" size={20} color={theme.colors.primary} />
                                </View>
                                <View style={styles.exerciseText}>
                                    <AppText style={styles.exerciseTitle}>{record.title?.trim() || 'Exercise session'}</AppText>
                                    <AppText variant="caption">
                                        {formatExerciseTime(record)} | {formatDuration(record)}
                                    </AppText>
                                    <AppText variant="caption">{formatActivitySource(record.data_origin)}</AppText>
                                </View>
                            </View>
                        ))}
                        {sourceLabels.length > 0 && (
                            <AppText variant="caption">Selected-day sources: {sourceLabels.join(', ')}</AppText>
                        )}
                    </AppCard>

                    <AppCard>
                        <SectionHeader
                            title="Imported weight"
                            description="Read-only Health Connect readings for this day. They do not overwrite manual weigh-ins."
                        />
                        {weightRecords.length === 0 ? (
                            <AppText variant="muted">
                                No Health Connect weight readings were imported for this day. Weight access is optional and off by default.
                            </AppText>
                        ) : weightRecords.map((record) => {
                            const unit = user?.weight_unit ?? WEIGHT_UNITS.KG;
                            const displayWeight = gramsToDisplayWeight(record.weight_grams, unit);
                            const device = [record.device_manufacturer, record.device_model].filter(Boolean).join(' ');
                            return (
                                <View key={record.id} style={styles.exerciseRow}>
                                    <View style={styles.weightIcon}>
                                        <Ionicons name="scale-outline" size={20} color={theme.colors.info} />
                                    </View>
                                    <View style={styles.exerciseText}>
                                        <AppText style={styles.weightValue}>
                                            {displayWeight} {formatWeightUnit(unit)}
                                        </AppText>
                                        <AppText variant="caption">Recorded {formatExerciseTime(record)}</AppText>
                                        <AppText variant="caption">Source: {formatActivitySource(record.data_origin)}</AppText>
                                        {device && <AppText variant="caption">Device: {device}</AppText>}
                                    </View>
                                </View>
                            );
                        })}
                        <AppText variant="muted">
                            Imported readings are preserved with their source for review and export. Log a manual weigh-in to update Calibrate's weight trend.
                        </AppText>
                    </AppCard>
                </>
            </AsyncStateBoundary>
            <AsyncStateBoundary
                state={historyState}
                resourceLabel="recent activity"
                loading={(
                    <AppCard>
                        <SectionHeader title="Recent days" description={`The latest ${HISTORY_DAY_COUNT} days. Select a row to inspect it.`} />
                        <AppText variant="muted">Loading recent activity...</AppText>
                    </AppCard>
                )}
                empty={(
                    <AppCard>
                        <SectionHeader title="Recent days" description={`The latest ${HISTORY_DAY_COUNT} days. Select a row to inspect it.`} />
                        <AppText variant="muted">No imported activity was found in this range.</AppText>
                    </AppCard>
                )}
                onRetry={isOnline ? () => historyQuery.refetch() : undefined}
                retrying={historyQuery.isFetching}
            >
            <AppCard>
                <SectionHeader
                    title="Recent days"
                    description={`The latest ${HISTORY_DAY_COUNT} days. Select a row to inspect it.`}
                />
                {historyDays.map((day) => (
                    <Pressable
                        key={day.local_date}
                        accessibilityRole="button"
                        accessibilityLabel={`View activity for ${formatDateOnlyForDisplay(day.local_date)}`}
                        onPress={() => navigation.setDate(day.local_date)}
                        style={({ pressed }) => [
                            styles.historyRow,
                            day.local_date === navigation.selectedDate && styles.historyRowSelected,
                            pressed && styles.pressed
                        ]}
                    >
                        <View style={styles.historyDate}>
                            <AppText style={styles.exerciseTitle}>{formatDateOnlyForDisplay(day.local_date)}</AppText>
                            <AppText variant="caption">
                                {day.summary ? `${formatNumber(day.summary.exercise_minutes, 0)} exercise min` : 'No imported summary'}
                            </AppText>
                        </View>
                        <View style={styles.historyMetrics}>
                            <AppText>{formatNumber(day.summary?.steps, 0)} steps</AppText>
                            <AppText variant="caption">{formatNumber(day.summary?.active_calories_kcal, 0)} active kcal</AppText>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
                    </Pressable>
                ))}
                <AppText variant="muted">
                    Samsung Health can take time to publish Galaxy Watch activity to Health Connect, so recent totals may change.
                </AppText>
            </AppCard>
            </AsyncStateBoundary>
        </TabScreen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    pressed: {
        opacity: 0.78
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomColor: theme.colors.outlineVariant,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    exerciseIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: theme.colors.primaryContainer
    },
    weightIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: theme.colors.infoContainer
    },
    exerciseText: {
        flex: 1,
        gap: spacing.xs
    },
    exerciseTitle: {
        fontWeight: '800'
    },
    weightValue: {
        fontSize: 18,
        fontWeight: '900'
    },
    historyRow: {
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control,
        borderRadius: radius.md
    },
    historyRowSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primaryContainer
    },
    historyDate: {
        flex: 1,
        gap: spacing.xs
    },
    historyMetrics: {
        alignItems: 'flex-end',
        gap: spacing.xs
    },
    error: {
        color: theme.colors.danger
    }
});
