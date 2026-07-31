import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import type { FoodLogDay } from '@calibrate/api-client';
import { useAuth } from '../auth/AuthContext';
import {
    foodDayRangeQueryKey,
    getCalendarMonthRange,
    getCalendarWeeks,
    getFoodDayCalendarMarker,
    getMonthKey,
    shiftMonth,
    type FoodDayCalendarMarker
} from '../food/calendar';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { type AppTheme, useAppTheme } from '../theme';
import { AppText } from './AppText';
import { CalendarModal } from './CalendarModal';

type HistoricalDatePickerProps = {
    visible: boolean;
    selectedDate: string;
    minDate: string;
    maxDate: string;
    onSelectDate: (date: string) => void;
    onRequestClose: () => void;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const CALENDAR_DAY_HEIGHT = 48; // Keeps each compact calendar row physically tappable.
const CALENDAR_MARKER_SIZE = 9; // Keeps completion marks visible without competing with day numbers.
const CALENDAR_CONTENT_MAX_WIDTH = 560; // Prevents calendar cells from stretching across wide browser sheets.

function formatMonth(monthKey: string): string {
    const [yearString, monthString] = monthKey.split('-');
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
        new Date(Number(yearString), Number(monthString) - 1, 1)
    );
}

function markerLabel(marker: FoodDayCalendarMarker): string {
    switch (marker) {
        case 'complete':
            return 'completed';
        case 'incomplete':
            return 'incomplete';
        case 'not-started':
            return 'not started';
        case 'paused':
            return 'tracking paused';
        default:
            return 'in progress';
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
    if (marker === 'complete') return <View testID="calendar-marker-complete" style={styles.completeMarker} />;
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
        <AppText variant="caption">{label}</AppText>
    </View>
);

export const HistoricalDatePicker: React.FC<HistoricalDatePickerProps> = ({
    visible,
    selectedDate,
    minDate,
    maxDate,
    onSelectDate,
    onRequestClose
}) => {
    const { api } = useAuth();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [visibleMonth, setVisibleMonth] = useState(() => getMonthKey(selectedDate));

    useEffect(() => {
        if (visible) setVisibleMonth(getMonthKey(selectedDate));
    }, [selectedDate, visible]);

    const monthRange = getCalendarMonthRange(visibleMonth, minDate, maxDate);
    const rangeQuery = useQuery({
        queryKey: foodDayRangeQueryKey(monthRange.startDate, monthRange.endDate),
        queryFn: () => api.getFoodDays(monthRange.startDate, monthRange.endDate),
        enabled: visible && monthRange.startDate <= monthRange.endDate
    });
    const dayByDate = useMemo(
        () => new Map((rangeQuery.data?.days ?? []).map((day) => [day.date, day])),
        [rangeQuery.data?.days]
    );
    const weeks = useMemo(() => getCalendarWeeks(visibleMonth), [visibleMonth]);
    const canGoPrevious = visibleMonth > getMonthKey(minDate);
    const canGoNext = visibleMonth < getMonthKey(maxDate);

    function selectDate(date: string) {
        onSelectDate(date);
        onRequestClose();
    }

    return (
        <CalendarModal visible={visible} onRequestClose={onRequestClose}>
            <View style={styles.calendarContent}>
                <View style={styles.heading}>
                    <View style={styles.headingCopy}>
                        <AppText variant="subtitle">Choose a day</AppText>
                        <AppText variant="caption">Review historical tracking status before opening a day.</AppText>
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
                    <AppText variant="subtitle" style={styles.monthLabel}>{formatMonth(visibleMonth)}</AppText>
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
                                const day = dayByDate.get(date) as FoodLogDay | undefined;
                                const marker = getFoodDayCalendarMarker(day, maxDate);
                                const isSelected = date === selectedDate;
                                const isToday = date === maxDate;
                                const statusLabel = markerLabel(marker);
                                const accessibilityLabel = [
                                    formatDateOnlyForDisplay(date),
                                    isToday ? 'today' : null,
                                    statusLabel
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
                                            disabled && styles.disabled,
                                            pressed && styles.pressed
                                        ]}
                                    >
                                        <AppText
                                            variant="label"
                                            style={[
                                                styles.dayNumber,
                                                isToday && styles.todayNumber,
                                                isSelected && styles.selectedDayNumber
                                            ]}
                                        >
                                            {Number(date.slice(-2))}
                                        </AppText>
                                        <View style={styles.markerSlot}>
                                            <CalendarMarker marker={marker} theme={theme} styles={styles} />
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                </View>

                <View style={styles.queryStatus}>
                    {rangeQuery.isLoading && (
                        <>
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                            <AppText variant="caption">Loading history...</AppText>
                        </>
                    )}
                    {rangeQuery.error && (
                        <>
                            <AppText variant="caption" style={styles.errorText}>Could not load tracking history.</AppText>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Retry tracking history"
                                onPress={() => void rangeQuery.refetch()}
                                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                            >
                                <AppText variant="label" style={styles.retryLabel}>Retry</AppText>
                            </Pressable>
                        </>
                    )}
                </View>

                <View style={styles.legend}>
                    <LegendItem label="Complete" marker="complete" theme={theme} styles={styles} />
                    <LegendItem label="Incomplete" marker="incomplete" theme={theme} styles={styles} />
                    <LegendItem label="Not started" marker="not-started" theme={theme} styles={styles} />
                    <LegendItem label="Paused" marker="paused" theme={theme} styles={styles} />
                </View>
            </View>
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
            height: CALENDAR_DAY_HEIGHT,
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
        todayNumber: {
            color: theme.colors.primary,
            fontWeight: '800'
        },
        selectedDayNumber: {
            color: theme.colors.onPrimaryContainer
        },
        markerSlot: {
            height: 14,
            alignItems: 'center',
            justifyContent: 'center'
        },
        markerPlaceholder: {
            width: CALENDAR_MARKER_SIZE,
            height: CALENDAR_MARKER_SIZE
        },
        completeMarker: {
            width: CALENDAR_MARKER_SIZE,
            height: CALENDAR_MARKER_SIZE,
            borderRadius: CALENDAR_MARKER_SIZE / 2,
            backgroundColor: theme.colors.success
        },
        incompleteMarker: {
            width: CALENDAR_MARKER_SIZE,
            height: CALENDAR_MARKER_SIZE,
            borderRadius: CALENDAR_MARKER_SIZE / 2,
            borderWidth: 2,
            borderColor: theme.colors.success
        },
        notStartedMarker: {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.outline
        },
        queryStatus: {
            minHeight: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm
        },
        errorText: {
            color: theme.colors.danger
        },
        retryButton: {
            minHeight: 32,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.sm
        },
        retryLabel: {
            color: theme.colors.primary
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
            gap: theme.spacing.xs
        },
        legendMarker: {
            width: 14,
            height: 14,
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
