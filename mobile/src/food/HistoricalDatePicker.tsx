import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useOfflineOutbox } from '../offline/provider';
import { createOutboxNamespace } from '../offline/queuedMutation';
import { calendarDayWithIntent } from './calendarIntent';
import { useAuth } from '../auth/AuthContext';
import {
    foodDayRangeQueryKey,
    getCalendarMonthRange,
    getCalendarWeeks,
    getFoodDayCalendarMarker,
    getFoodDayCalendarLabel,
    getMonthKey,
    shiftMonth,
    type FoodDayCalendarMarker
} from './calendar';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from '../components/AppText';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../components/AsyncStateBoundary';
import { CalendarModal } from '../components/CalendarModal';
import { isNeverEmpty } from '../asyncState/resolveAsyncState';
import { useFoodTrackingPause } from './useFoodTrackingPause';
import { getActivePausePlan, getPauseBrowseMonth, isPlannedPauseDate } from './plannedPause';

type HistoricalDatePickerProps = {
    visible: boolean;
    selectedDate: string;
    minDate: string;
    maxDate: string;
    onSelectDate: (date: string) => void;
    onRequestClose: () => void;
    footer?: React.ReactNode;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const CALENDAR_DAY_HEIGHT = 48; // Keeps each compact calendar row physically tappable.
const CALENDAR_STATUS_BADGE_SIZE = 34; // Makes the historical state the primary calendar-day silhouette.
const CALENDAR_LEGEND_MARKER_SIZE = 10; // Keeps legend symbols proportional to their compact labels.
const CALENDAR_CONTENT_MAX_WIDTH = 560; // Prevents calendar cells from stretching across wide browser sheets.

function formatMonth(monthKey: string): string {
    const [yearString, monthString] = monthKey.split('-');
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
        new Date(Number(yearString), Number(monthString) - 1, 1)
    );
}

const COMPLETED_MARKERS = {
    'complete-target': { label: 'Complete: target met' },
    'complete-between': { label: 'Complete: toward target from maintenance' },
    'complete-beyond': { label: 'Complete: beyond maintenance' },
    'complete-unavailable': { label: 'Complete: comparison unavailable' }
} as const;

function completedMarker(marker: FoodDayCalendarMarker) {
    if (marker in COMPLETED_MARKERS) return COMPLETED_MARKERS[marker as keyof typeof COMPLETED_MARKERS];
    return null;
}

function completedColors(marker: FoodDayCalendarMarker, theme: AppTheme) {
    switch (marker) {
        case 'complete-target': return { backgroundColor: theme.colors.success, color: theme.colors.onSuccess };
        case 'complete-between': return { backgroundColor: theme.colors.calendarBetween, color: theme.colors.onCalendarBetween };
        case 'complete-beyond': return { backgroundColor: theme.colors.calendarBeyond, color: theme.colors.onCalendarBeyond };
        default: return { backgroundColor: theme.colors.surfaceContainerHigh, color: theme.colors.onSurfaceVariant };
    }
}

const CalendarMarker: React.FC<{
    marker: FoodDayCalendarMarker;
    theme: AppTheme;
    styles: ReturnType<typeof createStyles>;
}> = ({ marker, theme, styles }) => {
    if (marker === 'paused') {
        return <Ionicons name="pause" size={13} color={theme.colors.onSurfaceVariant} />;
    }
    const complete = completedMarker(marker);
    if (complete) {
        const colors = completedColors(marker, theme);
        return <View style={[styles.completeMarker, { backgroundColor: colors.backgroundColor }]} />;
    }
    if (marker === 'incomplete') return <View testID="calendar-marker-incomplete" style={styles.incompleteMarker} />;
    if (marker === 'not-started') return <View testID="calendar-marker-not-started" style={styles.notStartedMarker} />;
    return <View style={styles.markerPlaceholder} />;
};

const LegendItem: React.FC<{
    label: string;
    marker: FoodDayCalendarMarker;
    theme: AppTheme;
    styles: ReturnType<typeof createStyles>;
}> = ({ label, marker, theme, styles }) => (
    <View style={styles.legendItem}>
        <View style={styles.legendMarker}>
            <CalendarMarker marker={marker} theme={theme} styles={styles} />
        </View>
        <AppText variant="caption" style={styles.legendLabel}>{label}</AppText>
    </View>
);

export const HistoricalDatePicker: React.FC<HistoricalDatePickerProps> = ({
    visible,
    selectedDate,
    minDate,
    maxDate,
    onSelectDate,
    onRequestClose,
    footer
}) => {
    const { api, user, serverUrl } = useAuth();
    const { dayIntents = [], mutations = [], readFoodDays } = useOfflineOutbox();
    const namespace = user && serverUrl ? createOutboxNamespace(serverUrl, user.id) : null;
    const dayIntent = [...dayIntents, ...mutations].filter(row => row.namespace === namespace && row.state !== 'failed');
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [visibleMonth, setVisibleMonth] = useState(() => getMonthKey(selectedDate));
    const pauseQuery = useFoodTrackingPause(visible);
    const pausePlan = getActivePausePlan(pauseQuery.data?.pause, maxDate);
    const lastBrowseMonth = getPauseBrowseMonth(maxDate, pausePlan);

    useEffect(() => {
        setVisibleMonth(month => month > lastBrowseMonth ? lastBrowseMonth : month);
    }, [lastBrowseMonth]);

    useEffect(() => {
        if (visible) setVisibleMonth(getMonthKey(selectedDate));
    }, [selectedDate, visible]);

    const displayMonth = visibleMonth > lastBrowseMonth ? lastBrowseMonth : visibleMonth;
    useEffect(() => {
        if (visible) void pauseQuery.refetch();
    }, [visible, displayMonth, pauseQuery.refetch]);
    const monthRange = getCalendarMonthRange(displayMonth, minDate, maxDate);
    const hasHistory = monthRange.startDate <= monthRange.endDate;
    const rangeQuery = useQuery({
        queryKey: foodDayRangeQueryKey(monthRange.startDate, monthRange.endDate),
        queryFn: () => {
            const fetch = () => api.getFoodDays(monthRange.startDate, monthRange.endDate);
            return readFoodDays ? readFoodDays(fetch) : fetch();
        },
        enabled: visible && hasHistory
    });
    const isOnline = useOnlineStatus();
    const rangeState = useAsyncResourceState(rangeQuery, isNeverEmpty);
    const dayByDate = useMemo(
        () => new Map((rangeQuery.data?.days ?? []).map((day) => [day.date, day])),
        [rangeQuery.data?.days]
    );
    const weeks = useMemo(() => getCalendarWeeks(displayMonth), [displayMonth]);
    const canGoPrevious = displayMonth > getMonthKey(minDate);
    const canGoNext = displayMonth < lastBrowseMonth;
    let planNotice: string | null = null;
    if (!isOnline) planNotice = pausePlan ? 'Offline - showing saved pause plan.' : 'Pause plan unavailable offline.';
    else if (pauseQuery.isError) planNotice = pausePlan ? 'Could not refresh the saved pause plan.' : 'Pause plan unavailable.';
    else if (pauseQuery.isPending) planNotice = 'Loading pause plan...';
    else if (pauseQuery.data?.pause.active && !pausePlan) planNotice = 'Pause plan unavailable.';

    function selectDate(date: string) {
        if (date < minDate || date > maxDate) return;
        onSelectDate(date);
        onRequestClose();
    }

    return (
        <CalendarModal visible={visible} onRequestClose={onRequestClose}>
            <View style={styles.calendarContent}>
                <View style={styles.heading}>
                    <View style={styles.headingCopy}>
                        <AppText variant="subtitle">Choose a day</AppText>
                        <AppText variant="caption">Completing your log is worth recognizing.</AppText>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close date picker"
                        onPress={onRequestClose}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                    >
                        <Ionicons name="close" size={22} color={theme.colors.onSurface} />
                    </Pressable>
                </View>

                <View style={styles.monthNavigation}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Previous month"
                        accessibilityState={{ disabled: !canGoPrevious }}
                        disabled={!canGoPrevious}
                        onPress={() => setVisibleMonth((month) => shiftMonth(month, -1))}
                        style={({ pressed }) => [
                            styles.iconButton,
                            !canGoPrevious && styles.disabled,
                            pressed && styles.pressed
                        ]}
                    >
                        <Ionicons name="chevron-back" size={22} color={theme.colors.onSurface} />
                    </Pressable>
                    <AppText variant="subtitle" style={styles.monthLabel}>{formatMonth(displayMonth)}</AppText>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Next month"
                        accessibilityState={{ disabled: !canGoNext }}
                        disabled={!canGoNext}
                        onPress={() => setVisibleMonth((month) => shiftMonth(month, 1))}
                        style={({ pressed }) => [
                            styles.iconButton,
                            !canGoNext && styles.disabled,
                            pressed && styles.pressed
                        ]}
                    >
                        <Ionicons name="chevron-forward" size={22} color={theme.colors.onSurface} />
                    </Pressable>
                </View>

                {planNotice && <AppText variant="caption" accessibilityLiveRegion="polite">{planNotice}</AppText>}
                <AsyncStateBoundary
                    state={hasHistory ? rangeState : { kind: 'content', error: null }}
                    resourceLabel="tracking history"
                    loading={(
                        <View style={styles.queryLoading}>
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                            <AppText variant="caption">Loading history...</AppText>
                        </View>
                    )}
                    empty={null}
                    onRetry={isOnline ? () => rangeQuery.refetch() : undefined}
                    retrying={rangeQuery.isFetching}
                >
                    <>
                        <View>
                            <View style={styles.week}>
                        {WEEKDAY_LABELS.map((label, index) => (
                            <View key={`${label}-${index}`} style={styles.weekday}>
                                <AppText variant="caption" style={styles.weekdayLabel}>{label}</AppText>
                            </View>
                        ))}
                    </View>
                    {weeks.map((week, weekIndex) => (
                        <View key={weekIndex} style={styles.week}>
                            {week.map((date, dayIndex) => {
                                if (!date) return <View key={`empty-${dayIndex}`} style={styles.dayCell} />;
                                const disabled = date < minDate || date > maxDate;
                                const day = date <= maxDate ? calendarDayWithIntent(date, dayByDate.get(date), dayIntent) : undefined;
                                const planned = isPlannedPauseDate(date, maxDate, pausePlan);
                                const marker = getFoodDayCalendarMarker(day, maxDate);
                                const isSelected = date === selectedDate;
                                const isToday = date === maxDate;
                                let statusLabel = getFoodDayCalendarLabel(day, maxDate);
                                if (date > maxDate) statusLabel = planned ? 'planned tracking pause' : 'future date';
                                if (planned && pausePlan?.expectedResumeOn === null) statusLabel += ', until resumed';
                                const complete = completedMarker(marker);
                                const colors = completedColors(marker, theme);
                                const accessibilityLabel = [
                                    formatDateOnlyForDisplay(date),
                                    isToday ? 'today' : null,
                                    statusLabel,
                                    isSelected ? 'selected' : null
                                ].filter(Boolean).join(', ');
                                return (
                                    <Pressable
                                        key={date}
                                        testID={`calendar-day-${date}`}
                                        accessibilityRole="button"
                                        accessibilityLabel={accessibilityLabel}
                                        accessibilityState={{ disabled, selected: isSelected }}
                                        disabled={disabled}
                                        onPress={() => selectDate(date)}
                                        style={({ pressed }) => [
                                            styles.dayCell,
                                            isSelected && styles.selectedDay,
                                            disabled && !planned && styles.disabled,
                                            pressed && styles.pressed
                                        ]}
                                    >
                                        <View
                                            testID={`calendar-date-badge-${date}`}
                                            style={[
                                                styles.dateBadge,
                                                complete && { backgroundColor: colors.backgroundColor },
                                                marker === 'incomplete' && styles.incompleteDateBadge,
                                                marker === 'not-started' && styles.notStartedDateBadge,
                                                marker === 'paused' && styles.pausedDateBadge,
                                                planned && styles.plannedDateBadge
                                            ]}
                                        >
                                            <AppText
                                                variant="label"
                                                style={[
                                                    styles.dayNumber,
                                                    isToday && styles.todayNumber,
                                                    isSelected && marker === 'none' && styles.selectedDayNumber,
                                                    complete && [styles.completeDayNumber, { color: colors.color }],
                                                    marker === 'incomplete' && styles.incompleteDayNumber,
                                                    marker === 'not-started' && styles.notStartedDayNumber,
                                                    (marker === 'paused' || planned) && styles.pausedDayNumber
                                                ]}
                                            >
                                                {Number(date.slice(-2))}
                                            </AppText>
                                            {(marker === 'paused' || planned) && (
                                                <Ionicons
                                                    name="pause"
                                                    size={9}
                                                    color={theme.colors.onSurfaceVariant}
                                                />
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                        </View>

                        <AppText variant="caption">When target is at/below maintenance, target met means at/below target and beyond means above maintenance. When target is above maintenance, target met means at/above target and beyond means below maintenance.</AppText>
                        <View style={styles.legend}>
                            {pausePlan && <View style={styles.legendItem}>
                                <View style={styles.plannedLegendMarker}><Ionicons name="pause" size={13} color={theme.colors.onSurfaceVariant} /></View>
                                <AppText variant="caption" style={styles.legendLabel}>Planned pause{pausePlan.expectedResumeOn === null ? ': until resumed' : ''} (future, view only)</AppText>
                            </View>}
                            {Object.entries(COMPLETED_MARKERS).map(([marker, complete]) => (
                                <LegendItem key={marker} label={complete.label} marker={marker as FoodDayCalendarMarker} theme={theme} styles={styles} />
                            ))}
                            <LegendItem label="Incomplete" marker="incomplete" theme={theme} styles={styles} />
                            <LegendItem label="Not started" marker="not-started" theme={theme} styles={styles} />
                            <LegendItem label="Paused" marker="paused" theme={theme} styles={styles} />
                        </View>
                    </>
                </AsyncStateBoundary>
            </View>
            {footer}
        </CalendarModal>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        calendarContent: {
            width: '100%',
            maxWidth: CALENDAR_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            gap: theme.spacing.md
        },
        heading: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: theme.spacing.md
        },
        headingCopy: {
            flex: 1,
            gap: theme.spacing.xs
        },
        monthNavigation: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm
        },
        monthLabel: {
            flex: 1,
            textAlign: 'center'
        },
        iconButton: {
            width: theme.interaction.minimumTouchTarget,
            height: theme.interaction.minimumTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md
        },
        week: {
            flexDirection: 'row'
        },
        weekday: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: theme.spacing.xs
        },
        weekdayLabel: {
            fontWeight: '700'
        },
        dayCell: {
            flex: 1,
            minHeight: CALENDAR_DAY_HEIGHT,
            paddingVertical: theme.spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.sm,
            borderWidth: theme.stroke.control,
            borderColor: 'transparent'
        },
        selectedDay: {
            backgroundColor: theme.colors.primaryContainer,
            borderColor: theme.colors.primary
        },
        dayNumber: {
            color: theme.colors.onSurface,
            lineHeight: 20
        },
        dateBadge: {
            minWidth: CALENDAR_STATUS_BADGE_SIZE,
            minHeight: CALENDAR_STATUS_BADGE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: CALENDAR_STATUS_BADGE_SIZE / 2
        },
        incompleteDateBadge: {
            borderWidth: 2,
            borderColor: theme.colors.success
        },
        notStartedDateBadge: {
            backgroundColor: theme.colors.surfaceContainer
        },
        pausedDateBadge: {
            borderWidth: theme.stroke.control,
            borderColor: theme.colors.outline,
            backgroundColor: theme.colors.surfaceContainerHigh
        },
        plannedDateBadge: {
            borderWidth: theme.stroke.control,
            borderStyle: 'dashed',
            borderColor: theme.colors.outline,
            backgroundColor: theme.colors.surface
        },
        plannedLegendMarker: {
            borderWidth: theme.stroke.control,
            borderStyle: 'dashed',
            borderColor: theme.colors.outline,
            borderRadius: theme.radius.sm,
            padding: theme.spacing.xs
        },
        todayNumber: {
            color: theme.colors.primary,
            fontWeight: '800'
        },
        selectedDayNumber: {
            color: theme.colors.onPrimaryContainer
        },
        completeDayNumber: {
            fontWeight: '800'
        },
        incompleteDayNumber: {
            color: theme.colors.success,
            fontWeight: '800'
        },
        notStartedDayNumber: {
            color: theme.colors.onSurfaceVariant
        },
        pausedDayNumber: {
            color: theme.colors.onSurfaceVariant,
            fontWeight: '700',
            lineHeight: 14
        },
        markerPlaceholder: {
            width: CALENDAR_LEGEND_MARKER_SIZE,
            height: CALENDAR_LEGEND_MARKER_SIZE
        },
        completeMarker: {
            width: CALENDAR_LEGEND_MARKER_SIZE,
            height: CALENDAR_LEGEND_MARKER_SIZE,
            borderRadius: CALENDAR_LEGEND_MARKER_SIZE / 2
        },
        incompleteMarker: {
            width: CALENDAR_LEGEND_MARKER_SIZE,
            height: CALENDAR_LEGEND_MARKER_SIZE,
            borderRadius: CALENDAR_LEGEND_MARKER_SIZE / 2,
            borderWidth: 2,
            borderColor: theme.colors.success
        },
        notStartedMarker: {
            width: CALENDAR_LEGEND_MARKER_SIZE,
            height: CALENDAR_LEGEND_MARKER_SIZE,
            borderRadius: CALENDAR_LEGEND_MARKER_SIZE / 2,
            backgroundColor: theme.colors.surfaceContainer
        },
        queryLoading: {
            minHeight: CALENDAR_DAY_HEIGHT * 3,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm
        },
        legend: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: theme.spacing.md
        },
        legendItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            flexShrink: 1
        },
        legendLabel: { flexShrink: 1 },
        legendMarker: {
            minWidth: theme.spacing.md,
            alignItems: 'center',
            justifyContent: 'center'
        },
        disabled: {
            opacity: 0.35
        },
        pressed: {
            backgroundColor: theme.colors.surfacePressed
        }
    });
}
