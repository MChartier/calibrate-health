import { useFoodLogDayQuery } from '../queries/foodLogDay';

/**
 * Load completion state for both the viewed day and today.
 *
 * The selected day controls the visible page lock, while PWA quick-add shortcuts always jump to today and must gate
 * against today's completion status even when the user was viewing another date.
 */
export function useSelectedAndTodayDayCompletion(selectedDate: string, today: string) {
    const selectedDayQuery = useFoodLogDayQuery(selectedDate);
    const needsSeparateTodayQuery = selectedDate !== today;
    const todayQuery = useFoodLogDayQuery(today, { enabled: needsSeparateTodayQuery });

    const isSelectedDayComplete = Boolean(selectedDayQuery.data?.is_complete);
    const isTodayComplete = needsSeparateTodayQuery ? Boolean(todayQuery.data?.is_complete) : isSelectedDayComplete;
    const isTodayCompletionLoading = needsSeparateTodayQuery ? todayQuery.isLoading : selectedDayQuery.isLoading;

    return {
        isSelectedDayComplete,
        isTodayComplete,
        isTodayCompletionLoading
    };
}
