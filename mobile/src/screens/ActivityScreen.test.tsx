import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActivityScreen from '../../app/(tabs)/activity';

jest.mock('../offline/usePendingWeightMutation', () => ({
    usePendingWeightMutation: () => false
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));

const mockGetActivityDays = jest.fn();
const mockGetUserProfile = jest.fn();
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({
        api: {
            getActivityDays: mockGetActivityDays,
            getUserProfile: mockGetUserProfile
        },
        user: { id: 7, weight_unit: 'KG', timezone: 'UTC' }
    })
}));

const mockNavigation = {
    selectedDate: '2026-08-08',
    selectedDateLabel: 'Aug 8, 2026',
    today: '2026-08-08',
    minDate: '2026-07-01',
    maxDate: '2026-08-08',
    isToday: true,
    canGoBack: true,
    canGoForward: false,
    goToPreviousDate: jest.fn(),
    goToNextDate: jest.fn(),
    goToToday: jest.fn(),
    setDate: jest.fn()
};
jest.mock('../hooks/useLogDateNavigation', () => ({
    useLogDateNavigation: () => mockNavigation
}));

jest.mock('../components/DateNavigation', () => ({ DateNavigation: () => null }));
jest.mock('../components/TabScreen', () => {
    const ReactModule = require('react');
    const { View } = require('react-native');
    return {
        TabScreen: ({ children }: { children: React.ReactNode }) => ReactModule.createElement(View, null, children)
    };
});

function renderScreen() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <ActivityScreen />
        </QueryClientProvider>
    );
}

describe('ActivityScreen async resource states', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        onlineManager.setOnline(true);
        mockGetActivityDays.mockImplementation(({ start, end }: { start: string; end: string }) => {
            if (start === end) return Promise.reject(new TypeError('Network unavailable'));
            return Promise.resolve({ days: [] });
        });
        mockGetUserProfile.mockResolvedValue({ calorieSummary: { tdee: 2100 } });
    });

    afterEach(() => {
        onlineManager.setOnline(true);
    });

    it('keeps the full selected-day context when activity is verified empty', async () => {
        mockGetActivityDays.mockResolvedValue({ days: [] });
        const screen = renderScreen();

        await waitFor(() => expect(screen.getByText('No imported activity for this day')).toBeTruthy());
        expect(screen.getByText('Exercise details')).toBeTruthy();
        expect(screen.getByText('No exercise sessions were imported for this day.')).toBeTruthy();
        expect(screen.getByText('Imported weight')).toBeTruthy();
        expect(screen.getByText(
            'No Health Connect weight readings were imported for this day. Weight access is optional and off by default.'
        )).toBeTruthy();
        expect(screen.getByText(
            "Imported readings are preserved with their source for review and export. Log a manual weigh-in to update Calibrate's weight trend."
        )).toBeTruthy();
    });

    it('shows one selected-day failure and retries only that resource', async () => {
        const screen = renderScreen();

        await waitFor(() => {
            expect(screen.getAllByText("Can't load selected-day activity")).toHaveLength(1);
        });
        expect(screen.queryByText("Can't load activity summary")).toBeNull();
        expect(screen.queryByText("Can't load activity details")).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);

        fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => {
            const selectedRequests = mockGetActivityDays.mock.calls.filter(
                ([request]) => request.start === request.end
            );
            expect(selectedRequests).toHaveLength(2);
        });
        const historyRequests = mockGetActivityDays.mock.calls.filter(
            ([request]) => request.start !== request.end
        );
        expect(historyRequests).toHaveLength(1);
        expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
    });
});
