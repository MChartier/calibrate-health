// @vitest-environment jsdom

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext.tsx';
import FoodEntryForm from './FoodEntryForm';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function renderFoodEntryForm({
    onSuccess = vi.fn()
}: {
    onSuccess?: (result?: { closeDialog?: boolean }) => void;
} = {}) {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false }
        }
    });

    render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <FoodEntryForm
                    date=" 2026-07-12 "
                    initialMealPeriod="LUNCH"
                    onSuccess={onSuccess}
                />
            </I18nProvider>
        </QueryClientProvider>
    );

    return { onSuccess };
}

async function enterQuickFood(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('textbox', { name: 'Search foods' }), '  Tofu scramble  ');
    await user.type(screen.getByRole('spinbutton', { name: 'Calories' }), '320');
    await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith('/api/food/search', expect.any(Object));
    });
}

describe('FoodEntryForm quick entry', () => {
    it('prevents incomplete entries and posts the normalized quick-entry payload once valid', async () => {
        const user = userEvent.setup();
        const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
        const { onSuccess } = renderFoodEntryForm();
        const addAnother = screen.getByRole('button', { name: 'Add another' }) as HTMLButtonElement;
        const addAndClose = screen.getByRole('button', { name: 'Add & close' }) as HTMLButtonElement;

        expect(addAnother.disabled).toBe(true);
        expect(addAndClose.disabled).toBe(true);

        await user.type(screen.getByRole('textbox', { name: 'Search foods' }), '  Tofu scramble  ');

        expect(screen.getByRole('spinbutton', { name: 'Calories' })).toBeTruthy();
        expect(addAnother.disabled).toBe(true);
        expect(post).not.toHaveBeenCalled();

        await user.type(screen.getByRole('spinbutton', { name: 'Calories' }), '320');

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith('/api/food/search', expect.any(Object));
        });

        expect(addAnother.disabled).toBe(false);
        expect(addAndClose.disabled).toBe(false);
        await user.click(addAnother);

        await waitFor(() => {
            expect(post).toHaveBeenCalledWith('/api/food', {
                name: 'Tofu scramble',
                calories: '320',
                meal_period: 'LUNCH',
                date: '2026-07-12'
            });
        });
        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledWith({ closeDialog: false });
            expect((screen.getByRole('textbox', { name: 'Search foods' }) as HTMLInputElement).value).toBe('');
        });
        expect(addAnother.disabled).toBe(true);
    });

    it('locks the form during submission and reports the close intent after success', async () => {
        const user = userEvent.setup();
        let resolveRequest: ((value: { data: object }) => void) | undefined;
        const pendingRequest = new Promise<{ data: object }>((resolve) => {
            resolveRequest = resolve;
        });
        vi.spyOn(axios, 'post').mockReturnValue(pendingRequest);
        const { onSuccess } = renderFoodEntryForm();
        await enterQuickFood(user);

        await user.click(screen.getByRole('button', { name: 'Add & close' }));

        await waitFor(() => {
            const pendingButtons = screen.getAllByRole('button', { name: 'Adding...' }) as HTMLButtonElement[];
            expect(pendingButtons).toHaveLength(2);
            expect(pendingButtons.every((button) => button.disabled)).toBe(true);
        });
        expect((screen.getByRole('textbox', { name: 'Search foods' }) as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByRole('spinbutton', { name: 'Calories' }) as HTMLInputElement).disabled).toBe(true);

        resolveRequest?.({ data: {} });

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ closeDialog: true }));
    });

    it('shows a recoverable error and re-enables submission when the request fails', async () => {
        const user = userEvent.setup();
        vi.spyOn(axios, 'post').mockRejectedValue(new Error('offline'));
        const { onSuccess } = renderFoodEntryForm();
        await enterQuickFood(user);

        await user.click(screen.getByRole('button', { name: 'Add & close' }));

        expect(await screen.findByText('Unable to add this food right now.')).toBeTruthy();
        expect(onSuccess).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: 'Add & close' }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole('textbox', { name: 'Search foods' }) as HTMLInputElement).disabled).toBe(false);
    });
});
