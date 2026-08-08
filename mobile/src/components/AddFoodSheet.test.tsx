import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import type { MyFoodSummary } from '@calibrate/api-client';
import { AddFoodSheet } from './AddFoodSheet';

const mockSavedFood: MyFoodSummary = {
    id: 12,
    type: 'FOOD',
    name: 'Greek yogurt',
    serving_size_quantity: 1,
    serving_unit_label: 'container',
    calories_per_serving: 120,
    is_pinned: true
};
const mockApi = {
    createFoodLog: jest.fn(),
    getMyFoods: jest.fn(async () => [mockSavedFood]),
    getRecentFoods: jest.fn(async () => ({ items: [] })),
    searchFood: jest.fn(async () => ({ items: [] }))
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ api: mockApi, user: { haptics_enabled: false } })
}));
jest.mock('../hooks/useReducedMotionPreference', () => ({
    useReducedMotionPreference: () => true
}));
jest.mock('../offline/provider', () => ({
    useOfflineOutbox: () => ({ enqueue: jest.fn() })
}));
jest.mock('../offline/operations', () => ({
    executeOrQueueMutation: jest.fn(),
    OFFLINE_MUTATION_OPERATIONS: { CREATE_FOOD_LOG: 'create-food-log' }
}));
jest.mock('../utils/haptics', () => ({ triggerHapticFeedback: jest.fn() }));
jest.mock('./FoodTrackingStatus', () => ({
    useFoodDayStatus: () => ({ data: { status: 'OPEN' } })
}));
jest.mock('./BottomSheetModal', () => {
    const { View } = jest.requireActual('react-native');
    return {
        BottomSheetModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (
            visible ? <View>{children}</View> : null
        )
    };
});

function renderSheet() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false, gcTime: Infinity }
        }
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <AddFoodSheet visible date="2026-08-07" onClose={jest.fn()} />
        </QueryClientProvider>
    );
}

describe('AddFoodSheet search experience', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('expands search into the available sheet space until the user finishes', async () => {
        const screen = renderSheet();
        const searchInput = screen.getByLabelText('Search foods');
        const context = screen.getByTestId('add-food-search-context');

        expect(context.props.accessibilityElementsHidden).toBe(false);
        fireEvent(searchInput, 'focus', { nativeEvent: {} });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
            expect(context.props.accessibilityElementsHidden).toBe(true);
        });

        fireEvent.press(screen.getByRole('button', { name: 'Done' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Scan' })).toBeTruthy();
            expect(context.props.accessibilityElementsHidden).toBe(false);
        });
    });

    it('dismisses search and restores setup context when a result is chosen', async () => {
        const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());
        const screen = renderSheet();
        fireEvent(screen.getByLabelText('Search foods'), 'focus', { nativeEvent: {} });

        fireEvent.press(await screen.findByRole('button', { name: 'Choose amount for Greek yogurt' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Back to food results' })).toBeTruthy();
            expect(screen.getByTestId('add-food-search-context').props.accessibilityElementsHidden).toBe(false);
        });
        expect(dismiss).toHaveBeenCalled();
    });
});
