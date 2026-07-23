import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FoodLogDay, FoodTrackingPause } from '@calibrate/api-client';
import { DayStatusCard, ResumeTrackingPrompt } from './FoodTrackingStatus';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'tracking-operation-id') }));

const mockEnqueue = jest.fn();
jest.mock('../offline/provider', () => ({
    useOfflineOutbox: () => ({ enqueue: mockEnqueue })
}));

const mockApi = {
    getFoodDay: jest.fn(),
    getFoodTrackingPause: jest.fn(),
    setFoodDayStatus: jest.fn(),
    startFoodTrackingPause: jest.fn(),
    updateFoodTrackingPause: jest.fn(),
    resumeFoodTracking: jest.fn()
};
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({
        api: mockApi,
        user: { id: 7, timezone: 'UTC' }
    })
}));

jest.mock('./BottomSheetModal', () => {
    const ReactModule = require('react');
    const { Pressable, Text, View } = require('react-native');
    return {
        BottomSheetModal: ({
            visible,
            children,
            onRequestClose
        }: {
            visible: boolean;
            children: any;
            onRequestClose: () => void;
        }) => visible
            ? ReactModule.createElement(
                View,
                null,
                children,
                ReactModule.createElement(
                    Pressable,
                    { accessibilityRole: 'button', onPress: onRequestClose },
                    ReactModule.createElement(Text, null, 'Dismiss sheet')
                )
            )
            : null
    };
});

jest.mock('./DatePickerField', () => {
    const ReactModule = require('react');
    const { Pressable, Text } = require('react-native');
    return {
        DatePickerField: ({
            label,
            onChangeDate
        }: {
            label: string;
            onChangeDate: (date: string) => void;
        }) => ReactModule.createElement(
            Pressable,
            { accessibilityRole: 'button', onPress: () => onChangeDate('2099-12-31') },
            ReactModule.createElement(Text, null, label)
        )
    };
});

const resolvedDay = (
    status: FoodLogDay['status'],
    source: FoodLogDay['source'] = 'STORED'
): FoodLogDay => ({
    date: '2026-07-23',
    status,
    origin: status === 'PAUSED' ? 'PAUSE' : 'USER',
    source,
    is_representative: status === 'COMPLETE',
    is_complete: status === 'COMPLETE',
    completed_at: null,
    updated_at: null
});

const duePause: FoodTrackingPause = {
    active: true,
    id: 4,
    starts_on: '2026-07-20',
    expected_resume_on: '2026-07-23',
    resumed_on: null,
    started_at: '2026-07-20T08:00:00.000Z',
    resumed_at: null,
    materialized_through: '2026-07-23',
    resume_confirmation_due: true
};

let foregroundListener: ((state: string) => void) | undefined;
let appStateSpy: jest.SpyInstance;

function renderWithQuery(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    });
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe('food tracking day resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        foregroundListener = undefined;
        appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
            foregroundListener = listener as (state: string) => void;
            return { remove: jest.fn() };
        });
    });

    afterEach(() => appStateSpy.mockRestore());

    it('offers completion, incomplete, and pause actions for an open current day', async () => {
        mockApi.getFoodDay.mockResolvedValue(resolvedDay('OPEN'));
        const screen = renderWithQuery(<DayStatusCard date="2026-07-23" isToday />);

        await waitFor(() => expect(screen.getByText('Tracking in progress')).toBeTruthy());
        expect(screen.getByText('Complete day')).toBeTruthy();
        expect(screen.getByText('Mark incomplete')).toBeTruthy();
        fireEvent.press(screen.getByText('Pause tracking'));

        expect(screen.getByText('Pause calorie tracking?')).toBeTruthy();
        expect(screen.getByText(/Calorie tracking and all reminders will stop/)).toBeTruthy();
        expect(screen.getByText('Until I resume')).toBeTruthy();
        expect(screen.getByText('Choose expected resume date')).toBeTruthy();
    });

    it('presents inferred blank, incomplete, complete, and paused days without food prompts', async () => {
        const cases: Array<[FoodLogDay, string]> = [
            [resolvedDay('INCOMPLETE', 'INFERRED_EMPTY'), 'Tracking was not completed'],
            [resolvedDay('INCOMPLETE'), 'Day incomplete'],
            [resolvedDay('COMPLETE'), 'Day complete'],
            [resolvedDay('PAUSED'), 'Calorie tracking paused']
        ];

        for (const [day, title] of cases) {
            mockApi.getFoodDay.mockResolvedValueOnce(day);
            const screen = renderWithQuery(<DayStatusCard date="2026-07-23" isToday />);
            await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
            expect(screen.queryByText('Complete day')).toBeNull();
            expect(screen.queryByText('Mark incomplete')).toBeNull();
            screen.unmount();
        }
    });

    it('asks for confirmation when an expected resume date is due and exposes every extension path', async () => {
        mockApi.getFoodTrackingPause.mockResolvedValue({ pause: duePause });
        const screen = renderWithQuery(<ResumeTrackingPrompt />);

        await waitFor(() => expect(screen.getByText('Ready to resume tracking?')).toBeTruthy());
        expect(screen.getByText('Resume tracking')).toBeTruthy();
        fireEvent.press(screen.getByText('Extend pause'));

        expect(screen.getByText('Tomorrow')).toBeTruthy();
        expect(screen.getByText('Choose another date')).toBeTruthy();
        expect(screen.getByText('Until I resume')).toBeTruthy();
    });

    it('keeps the pause active when the confirmation is dismissed and offers it again next foreground', async () => {
        mockApi.getFoodTrackingPause.mockResolvedValue({ pause: duePause });
        const screen = renderWithQuery(<ResumeTrackingPrompt />);

        await waitFor(() => expect(screen.getByText('Ready to resume tracking?')).toBeTruthy());
        fireEvent.press(screen.getByText('Dismiss sheet'));
        await waitFor(() => expect(screen.queryByText('Ready to resume tracking?')).toBeNull());
        expect(mockApi.resumeFoodTracking).not.toHaveBeenCalled();
        expect(mockApi.updateFoodTrackingPause).not.toHaveBeenCalled();

        await act(async () => {
            foregroundListener?.('active');
        });
        await waitFor(() => expect(screen.getByText('Ready to resume tracking?')).toBeTruthy());
    });

    it('updates the expected date for tomorrow, a chosen date, or until manual resume', async () => {
        mockApi.getFoodTrackingPause.mockResolvedValue({ pause: duePause });
        mockApi.updateFoodTrackingPause.mockImplementation(async ({ expected_resume_on }) => ({
            pause: { ...duePause, expected_resume_on, resume_confirmation_due: false }
        }));

        const tomorrowScreen = renderWithQuery(<ResumeTrackingPrompt />);
        await waitFor(() => expect(tomorrowScreen.getByText('Extend pause')).toBeTruthy());
        fireEvent.press(tomorrowScreen.getByText('Extend pause'));
        fireEvent.press(tomorrowScreen.getByText('Tomorrow'));
        await waitFor(() => expect(mockApi.updateFoodTrackingPause).toHaveBeenCalledWith(
            { expected_resume_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
            'tracking-operation-id'
        ));
        tomorrowScreen.unmount();

        mockApi.updateFoodTrackingPause.mockClear();
        const chosenScreen = renderWithQuery(<ResumeTrackingPrompt />);
        await waitFor(() => expect(chosenScreen.getByText('Extend pause')).toBeTruthy());
        fireEvent.press(chosenScreen.getByText('Extend pause'));
        fireEvent.press(chosenScreen.getByText('Choose another date'));
        fireEvent.press(chosenScreen.getByText('Use chosen date'));
        await waitFor(() => expect(mockApi.updateFoodTrackingPause).toHaveBeenCalledWith(
            { expected_resume_on: '2099-12-31' },
            'tracking-operation-id'
        ));
        chosenScreen.unmount();

        mockApi.updateFoodTrackingPause.mockClear();
        const manualScreen = renderWithQuery(<ResumeTrackingPrompt />);
        await waitFor(() => expect(manualScreen.getByText('Extend pause')).toBeTruthy());
        fireEvent.press(manualScreen.getByText('Extend pause'));
        fireEvent.press(manualScreen.getByText('Until I resume'));
        await waitFor(() => expect(mockApi.updateFoodTrackingPause).toHaveBeenCalledWith(
            { expected_resume_on: null },
            'tracking-operation-id'
        ));
    });

    it('confirms resume explicitly and reopens the local resume day', async () => {
        mockApi.getFoodTrackingPause.mockResolvedValue({ pause: duePause });
        mockApi.resumeFoodTracking.mockResolvedValue({
            pause: { ...duePause, active: false, resumed_on: '2026-07-23', resume_confirmation_due: false },
            day: resolvedDay('OPEN')
        });
        const screen = renderWithQuery(<ResumeTrackingPrompt />);

        await waitFor(() => expect(screen.getByText('Resume tracking')).toBeTruthy());
        fireEvent.press(screen.getByText('Resume tracking'));
        await waitFor(() => expect(mockApi.resumeFoodTracking).toHaveBeenCalledWith(
            { resumed_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
            'tracking-operation-id'
        ));
    });
});
