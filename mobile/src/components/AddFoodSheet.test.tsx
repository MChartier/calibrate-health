/**
 * Exercises add food sheet behavior and regression boundaries.
 */
import React from 'react';
import { Platform } from 'react-native';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEAL_PERIODS } from '@calibrate/shared';
import { AddFoodSheet } from './AddFoodSheet';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'food-operation-id') }));
jest.mock('../utils/haptics', () => ({ triggerHapticFeedback: jest.fn() }));

const mockApi = {
    getFoodDay: jest.fn(),
    getRecentFoods: jest.fn(),
    searchFood: jest.fn(),
    getMyFoods: jest.fn(),
    createFoodLog: jest.fn()
};

jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({
        api: mockApi,
        user: { id: 7, haptics_enabled: false }
    })
}));

jest.mock('../offline/provider', () => ({
    useOfflineOutbox: () => ({ enqueue: jest.fn() })
}));

jest.mock('./BottomSheetModal', () => {
    const ReactModule = require('react');
    const { View } = require('react-native');
    return {
        BottomSheetModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
            visible ? ReactModule.createElement(View, null, children) : null
    };
});

/** Render sheet. */
function renderSheet(seed?: (queryClient: QueryClient) => void) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    });
    seed?.(queryClient);
    return render(
        <QueryClientProvider client={queryClient}>
            <AddFoodSheet
                visible
                date="2026-08-08"
                initialMeal={MEAL_PERIODS.BREAKFAST}
                onClose={jest.fn()}
            />
        </QueryClientProvider>
    );
}

describe('AddFoodSheet async resource states', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApi.getFoodDay.mockResolvedValue({ date: '2026-08-08', status: 'OPEN' });
        mockApi.getRecentFoods.mockResolvedValue({ items: [] });
        mockApi.searchFood.mockResolvedValue({ items: [] });
        mockApi.getMyFoods.mockResolvedValue([]);
        onlineManager.setOnline(false);
    });

    afterEach(() => {
        cleanup();
        onlineManager.setOnline(true);
    });

    it('does not describe an uncached offline food search as having no matches', async () => {
        const screen = renderSheet();
        const searchField = screen.getByLabelText('Search foods');
        fireEvent.changeText(searchField, 'apple');
        fireEvent(searchField, 'submitEditing');

        await waitFor(() => expect(screen.getByText('Connect to the internet to load food search.')).toBeTruthy());
        expect(screen.queryByText('No matching foods found.')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
        expect(mockApi.searchFood).not.toHaveBeenCalled();
    });

    it('keeps the empty web search result region keyboard reachable', () => {
        const replacedPlatform = jest.replaceProperty(Platform, 'OS', 'web');
        try {
            const screen = renderSheet();
            expect(screen.getByTestId('food-search-results').props.tabIndex).toBe(0);
        } finally {
            replacedPlatform.restore();
        }
    });

    it('keeps cached recipes usable while labeling them stale offline', async () => {
        const screen = renderSheet((queryClient) => {
            queryClient.setQueryData(['mobile-my-foods'], [{
                id: 14,
                type: 'RECIPE',
                name: 'Overnight oats',
                is_pinned: false,
                calories_per_serving: 320
            }]);
        });
        fireEvent.press(screen.getByRole('radio', { name: 'Recipes' }));

        await waitFor(() => expect(screen.getByText('Offline - showing saved information')).toBeTruthy());
        expect(screen.getByText('Overnight oats')).toBeTruthy();
        expect(screen.queryByText('No saved recipes yet. Create one in Saved foods to reuse it here.')).toBeNull();
    });

    it('does not describe an uncached offline recipe library as empty', async () => {
        const screen = renderSheet();
        fireEvent.press(screen.getByRole('radio', { name: 'Recipes' }));

        await waitFor(() => expect(screen.getByText('Connect to the internet to load saved recipes.')).toBeTruthy());
        expect(screen.queryByText('No saved recipes yet. Create one in Saved foods to reuse it here.')).toBeNull();
        expect(screen.queryByText('No recipes match this search.')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
        expect(mockApi.getMyFoods).not.toHaveBeenCalled();
    });

    it('links to Saved foods from the Add Food sheet', () => {
        const screen = renderSheet();

        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));

        const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
        expect(router.push).toHaveBeenCalledWith('/my-foods');
    });
});
