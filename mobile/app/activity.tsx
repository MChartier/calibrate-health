import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ACTIVITY_RECORD_TYPES, WEIGHT_UNITS } from '@calibrate/shared';
import type { ActivityRecordEntry } from '@calibrate/api-client';
import { formatActivitySource } from '../src/activity/presentation';
import { ActivitySummaryCard } from '../src/components/ActivitySummaryCard';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { DateNavigation } from '../src/components/DateNavigation';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { useAuth } from '../src/auth/AuthContext';
import { useLogDateNavigation } from '../src/hooks/useLogDateNavigation';
import { colors, radius, spacing } from '../src/theme';
import { addDaysToDateOnly, formatDateOnlyForDisplay } from '../src/utils/dates';
import { gramsToDisplayWeight } from '../src/utils/bodyMeasurements';
import { formatNumber, formatWeightUnit } from '../src/utils/format';

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
        <Screen safeTop>
            <View style={styles.header}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                >
                    <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
                <View style={styles.headerText}>
                    <AppText variant="screenTitle">Activity history</AppText>
                    <AppText variant="caption">Observed through Health Connect</AppText>
                </View>
            </View>

            <DateNavigation navigation={navigation} />
            <ActivitySummaryCard
                day={selectedDay}
                isToday={navigation.isToday}
                profileTdee={profileQuery.data?.calorieSummary.tdee}
                isLoading={selectedQuery.isLoading}
                error={selectedQuery.error}
                onRetry={() => void selectedQuery.refetch()}
            />

            <AppCard>
                <SectionHeader title="Exercise details" description="Sessions imported for the selected day." />
                {selectedQuery.isLoading ? (
                    <AppText variant="muted">Loading exercise sessions...</AppText>
                ) : exerciseRecords.length === 0 ? (
                    <AppText variant="muted">No exercise sessions were imported for this day.</AppText>
                ) : exerciseRecords.map((record) => (
                    <View key={record.id} style={styles.exerciseRow}>
                        <View style={styles.exerciseIcon}>
                            <Ionicons name="fitness-outline" size={20} color={colors.primaryDark} />
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
                {selectedQuery.isLoading ? (
                    <AppText variant="muted">Loading imported weight...</AppText>
                ) : weightRecords.length === 0 ? (
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
                                <Ionicons name="scale-outline" size={20} color={colors.info} />
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

            <AppCard>
                <SectionHeader
                    title="Recent days"
                    description={`The latest ${HISTORY_DAY_COUNT} days. Select a row to inspect it.`}
                />
                {historyQuery.isLoading ? (
                    <AppText variant="muted">Loading recent activity...</AppText>
                ) : historyQuery.error ? (
                    <AppText accessibilityRole="alert" style={styles.error}>
                        {historyQuery.error.message}
                    </AppText>
                ) : historyDays.map((day) => (
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
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                ))}
                <AppText variant="muted">
                    Samsung Health can take time to publish Galaxy Watch activity to Health Connect, so recent totals may change.
                </AppText>
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    headerButton: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.surface
    },
    headerText: {
        flex: 1,
        gap: spacing.xs
    },
    pressed: {
        opacity: 0.78
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    exerciseIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft
    },
    weightIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.infoSoft
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
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md
    },
    historyRowSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySoft
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
        color: colors.danger
    }
});
