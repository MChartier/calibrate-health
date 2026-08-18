import React from 'react';
import { Keyboard, Platform } from 'react-native';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { RecentFoodSummary } from '@calibrate/api-client';
import { AddFoodSheet } from './AddFoodSheet';
import { getSavedFoodsLibraryQueryKey } from '../savedFoods/queryKeys';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'food-operation-id') }));
jest.mock('../utils/haptics', () => ({ triggerHapticFeedback: jest.fn() }));
const mockConfirmDiscardChanges = jest.fn(async () => true);
jest.mock('./confirmDiscardChanges', () => ({
    confirmDiscardChanges: () => mockConfirmDiscardChanges()
}));

const mockApi = {
    getFoodDay: jest.fn(),
    getRecentFoods: jest.fn(),
    searchFood: jest.fn(),
    getMyFoods: jest.fn(),
    getMyFoodsLibrary: jest.fn(),
    createFoodLog: jest.fn()
};

function createRecentFoodFixture() {
    return {
        id: 'recent-1',
        name: 'Greek yogurt',
        meal_period: MEAL_PERIODS.BREAKFAST,
        calories: 150,
        my_food_id: null,
        servings_consumed: 1,
        serving_size_quantity_snapshot: 1,
        serving_unit_label_snapshot: 'container',
        calories_per_serving_snapshot: 150,
        external_source: null,
        external_id: null,
        brand_snapshot: null,
        locale_snapshot: null,
        barcode_snapshot: null,
        measure_label_snapshot: null,
        grams_per_measure_snapshot: null,
        measure_quantity_snapshot: null,
        grams_total_snapshot: null,
        last_logged_at: '2026-08-08T12:00:00.000Z',
        times_logged: 1
    };
}

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
        BottomSheetModal: ({
            visible,
            children,
            contentStyle
        }: {
            visible: boolean;
            children: React.ReactNode;
            contentStyle?: object;
        }) => visible
            ? ReactModule.createElement(View, { testID: 'add-food-sheet-content', style: contentStyle }, children)
            : null
    };
});

function recentFood(name: string, mealPeriod: MealPeriod): RecentFoodSummary {
    return {
        id: `recent:${name.toLocaleLowerCase().replaceAll(' ', '-')}`,
        name,
        meal_period: mealPeriod,
        calories: 150,
        my_food_id: null,
        servings_consumed: 1,
        serving_size_quantity_snapshot: 1,
        serving_unit_label_snapshot: 'serving',
        calories_per_serving_snapshot: 150,
        external_source: null,
        external_id: null,
        brand_snapshot: null,
        locale_snapshot: null,
        barcode_snapshot: null,
        measure_label_snapshot: null,
        grams_per_measure_snapshot: null,
        measure_quantity_snapshot: null,
        grams_total_snapshot: null,
        last_logged_at: '2026-08-08T12:00:00.000Z',
        times_logged: 1
    };
}

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
        mockApi.getMyFoodsLibrary.mockResolvedValue({ items: [], next_cursor: null });
        onlineManager.setOnline(false);
    });

    afterEach(() => {
        cleanup();
        onlineManager.setOnline(true);
    });

    it('preloads meal-aware recent foods before typing and refreshes them when the meal changes', async () => {
        onlineManager.setOnline(true);
        mockApi.getRecentFoods.mockImplementation(({ meal_period }: { meal_period?: MealPeriod }) => Promise.resolve({
            items: meal_period === MEAL_PERIODS.AFTERNOON_SNACK
                ? [recentFood('Snack yogurt', MEAL_PERIODS.AFTERNOON_SNACK)]
                : [recentFood('Breakfast oats', MEAL_PERIODS.BREAKFAST)]
        }));
        const screen = renderSheet();

        expect(await screen.findByText('Breakfast oats')).toBeTruthy();
        expect(mockApi.getRecentFoods).toHaveBeenCalledWith({
            q: undefined,
            limit: 8,
            meal_period: MEAL_PERIODS.BREAKFAST
        });
        expect(mockApi.searchFood).not.toHaveBeenCalled();

        fireEvent.press(screen.getByLabelText('Select meal'));
        fireEvent.press(screen.getByLabelText('Afternoon Snack'));

        expect(await screen.findByText('Snack yogurt')).toBeTruthy();
        expect(mockApi.getRecentFoods).toHaveBeenLastCalledWith({
            q: undefined,
            limit: 8,
            meal_period: MEAL_PERIODS.AFTERNOON_SNACK
        });
    }, 10_000);

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

    it('keeps results visible and actionable while the mobile search field is focused', () => {
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');

        try {
            const screen = renderSheet((queryClient) => {
                queryClient.setQueryData(['mobile-recent-foods', MEAL_PERIODS.BREAKFAST, 'browse'], {
                    items: [createRecentFoodFixture()]
                });
                queryClient.setQueryData(['mobile-my-foods'], []);
            });
            const searchField = screen.getByLabelText('Search foods');

            fireEvent(searchField, 'focus');

            expect(screen.queryByRole('button', { name: 'Scan' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Saved foods' })).toBeNull();
            expect(screen.queryByLabelText('Select meal')).toBeNull();
            expect(screen.queryByRole('radio', { name: 'Quick' })).toBeNull();
            expect(screen.getByTestId('food-search-results')).toBeTruthy();

            fireEvent(searchField, 'blur');
            expect(screen.getByTestId('food-search-results')).toBeTruthy();
            fireEvent.press(screen.getByLabelText('Choose amount for Greek yogurt'));

            expect(dismissKeyboard).toHaveBeenCalled();
            expect(screen.queryByTestId('food-search-results')).toBeNull();
        } finally {
            dismissKeyboard.mockRestore();
        }
    });

    it('removes the Android bottom inset only while the search workspace is focused', () => {
        const replacedPlatform = jest.replaceProperty(Platform, 'OS', 'android');
        try {
            const screen = renderSheet();

            expect(screen.getByTestId('add-food-sheet-content').props.style).toBeUndefined();
            fireEvent(screen.getByLabelText('Search foods'), 'focus');
            expect(screen.getByTestId('add-food-sheet-content').props.style).toMatchObject({
                paddingBottom: 0
            });
        } finally {
            replacedPlatform.restore();
        }
    });

    it('keeps cached recipes usable while labeling them stale offline', async () => {
        const screen = renderSheet((queryClient) => {
            queryClient.setQueryData(getSavedFoodsLibraryQueryKey('', 'RECIPE'), {
                pages: [{
                    items: [{
                        id: 14,
                        type: 'RECIPE',
                        name: 'Overnight oats',
                        is_pinned: false,
                        serving_size_quantity: 1,
                        serving_unit_label: 'serving',
                        calories_per_serving: 320,
                        recipe_total_calories: 640,
                        yield_servings: 2
                    }],
                    next_cursor: null
                }],
                pageParams: [undefined]
            });
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
        expect(mockApi.getMyFoodsLibrary).not.toHaveBeenCalled();
    });

    it('searches the recipe library on the server instead of filtering the legacy saved-food cache', async () => {
        onlineManager.setOnline(true);
        mockApi.getMyFoodsLibrary.mockImplementation(({ q }: { q?: string }) => Promise.resolve({
            items: q === 'oats' ? [{
                id: 14,
                type: 'RECIPE',
                name: 'Overnight oats',
                is_pinned: false,
                serving_size_quantity: 1,
                serving_unit_label: 'serving',
                calories_per_serving: 320,
                recipe_total_calories: 640,
                yield_servings: 2
            }] : [],
            next_cursor: null
        }));
        const screen = renderSheet();

        fireEvent.press(screen.getByRole('radio', { name: 'Recipes' }));
        fireEvent.changeText(screen.getByLabelText('Search recipes'), '  oats  ');

        await waitFor(() => expect(mockApi.getMyFoodsLibrary).toHaveBeenCalledWith({
            q: 'oats',
            type: 'RECIPE',
            cursor: undefined,
            limit: 24
        }));
        expect(await screen.findByText('Overnight oats')).toBeTruthy();
    });

    it('links to Saved foods from the Add Food sheet', () => {
        const screen = renderSheet();

        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));

        const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
        expect(router.push).toHaveBeenCalledWith('/my-foods');

        fireEvent.press(screen.getByRole('radio', { name: 'Quick' }));
        expect(screen.queryByRole('button', { name: 'Saved foods' })).toBeNull();

        fireEvent.press(screen.getByRole('radio', { name: 'Recipes' }));
        expect(screen.getByRole('button', { name: 'Saved foods' })).toBeTruthy();
    });

    it('confirms before Saved foods or Scan discards a selected food draft', async () => {
        onlineManager.setOnline(true);
        mockConfirmDiscardChanges.mockResolvedValue(false);
        const recentFood = createRecentFoodFixture();
        mockApi.getRecentFoods.mockResolvedValue({ items: [recentFood] });
        const screen = renderSheet();
        const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

        fireEvent.press(await screen.findByLabelText('Choose amount for Greek yogurt'));
        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));
        fireEvent.press(screen.getByRole('button', { name: 'Scan' }));

        await waitFor(() => expect(mockConfirmDiscardChanges).toHaveBeenCalledTimes(2));
        expect(router.push).not.toHaveBeenCalled();

        mockConfirmDiscardChanges.mockResolvedValue(true);
        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));

        await waitFor(() => expect(router.push).toHaveBeenCalledWith('/my-foods'));
    });
});
