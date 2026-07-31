import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FoodLogDay, FoodLogDaySource, FoodLogDayStatus } from '@calibrate/api-client';
import { themes } from '../theme';
import { HistoricalDatePicker } from './HistoricalDatePicker';

const mockGetFoodDays = jest.fn();

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ api: { getFoodDays: mockGetFoodDays } })
}));
jest.mock('../components/BottomSheetModal', () => {
    const ReactModule = require('react') as typeof import('react');
    const { View } = require('react-native') as typeof import('react-native');
    return {
        BottomSheetModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
            visible ? ReactModule.createElement(View, null, children) : null
    };
});

function day(
    date: string,
    status: FoodLogDayStatus,
    source: FoodLogDaySource
): FoodLogDay {
    return {
        date,
        status,
        source,
        origin: source === 'STORED' ? 'USER' : source === 'ACTIVE_PAUSE' ? 'PAUSE' : null,
        is_representative: status === 'COMPLETE',
        is_complete: status === 'COMPLETE',
        completed_at: null,
        updated_at: null
    };
}

describe('HistoricalDatePicker', () => {
    beforeEach(() => {
        mockGetFoodDays.mockReset();
        mockGetFoodDays.mockResolvedValue({
            start_date: '2026-07-11',
            end_date: '2026-07-18',
            days: [
                day('2026-07-11', 'COMPLETE', 'STORED'),
                day('2026-07-12', 'INCOMPLETE', 'STORED'),
                day('2026-07-13', 'INCOMPLETE', 'INFERRED_EMPTY'),
                day('2026-07-14', 'PAUSED', 'ACTIVE_PAUSE'),
                day('2026-07-18', 'OPEN', 'DEFAULT')
            ]
        });
    });

    it('loads the visible range, exposes status labels, and selects a day', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { gcTime: Infinity, retry: false } }
        });
        const onSelectDate = jest.fn();
        const onRequestClose = jest.fn();
        const screen = render(
            <QueryClientProvider client={queryClient}>
                <HistoricalDatePicker
                    visible
                    selectedDate="2026-07-12"
                    minDate="2026-07-11"
                    maxDate="2026-07-18"
                    onSelectDate={onSelectDate}
                    onRequestClose={onRequestClose}
                />
            </QueryClientProvider>
        );

        await waitFor(() => expect(mockGetFoodDays).toHaveBeenCalledWith('2026-07-11', '2026-07-18'));
        const completeDay = await screen.findByLabelText(/Jul 11, 2026, completed/i);
        expect(completeDay).toBeTruthy();
        expect(screen.getByLabelText(/Jul 12, 2026, incomplete/i)).toBeTruthy();
        expect(screen.getByLabelText(/Jul 13, 2026, not started/i)).toBeTruthy();
        expect(screen.getByLabelText(/Jul 14, 2026, tracking paused/i)).toBeTruthy();
        expect(screen.getByLabelText(/Jul 18, 2026, today, in progress/i)).toBeTruthy();

        expect(StyleSheet.flatten(screen.getByTestId('calendar-date-badge-2026-07-11').props.style)).toEqual(
            expect.objectContaining({
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: themes.light.colors.success
            })
        );
        expect(StyleSheet.flatten(screen.getByTestId('calendar-date-badge-2026-07-12').props.style)).toEqual(
            expect.objectContaining({
                width: 34,
                height: 34,
                borderWidth: 2,
                borderColor: themes.light.colors.success
            })
        );
        expect(StyleSheet.flatten(screen.getByTestId('calendar-date-badge-2026-07-13').props.style)).toEqual(
            expect.objectContaining({
                backgroundColor: themes.light.colors.surfaceContainer
            })
        );
        expect(StyleSheet.flatten(screen.getByTestId('calendar-date-badge-2026-07-14').props.style)).toEqual(
            expect.objectContaining({
                borderColor: themes.light.colors.outline,
                backgroundColor: themes.light.colors.surfaceContainerHigh
            })
        );

        fireEvent.press(completeDay);
        expect(onSelectDate).toHaveBeenCalledWith('2026-07-11');
        expect(onRequestClose).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Previous month').props.accessibilityState.disabled).toBe(true);
        expect(screen.getByLabelText('Next month').props.accessibilityState.disabled).toBe(true);
        screen.unmount();
        queryClient.clear();
    });
});
