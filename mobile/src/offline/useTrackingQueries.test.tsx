import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrackingFood } from './useTrackingQueries';
import type { QueuedMutation } from './queuedMutation';

const mockGetFoodLog = jest.fn();
let mockAuth = { serverUrl: 'https://one.invalid', user: { id: 1 }, api: { getFoodLog: mockGetFoodLog } };
let mockMutations: QueuedMutation[] = [];
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('./provider', () => ({ useOfflineOutbox: () => ({ mutations: mockMutations }) }));
const date = '2026-07-21';
const queued = { sequence: 1, id: 'create-one', namespace: 'https://one.invalid::user:1', operation: 'food.create', payload: { date, meal_period: 'BREAKFAST', name: 'Local oats', calories: 200 }, state: 'pending', attemptCount: 0, lastError: null, createdAt: 1, updatedAt: 1 } as QueuedMutation;

it('rehydrates intent without polluting server snapshots and filters another account or server synchronously', async () => {
    mockMutations = JSON.parse(JSON.stringify([queued]));
    mockGetFoodLog.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['mobile-food', date], []);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(() => useTrackingFood(date), { wrapper });
    expect(view.result.current.data).toEqual([expect.objectContaining({ name: 'Local oats', calories: 200 })]);
    expect(client.getQueryData(['mobile-food', date])).toEqual([]);
    expect(mockGetFoodLog).not.toHaveBeenCalled();
    mockAuth = { ...mockAuth, user: { id: 2 } }; view.rerender({});
    expect(view.result.current.data).toEqual([]);
    mockAuth = { ...mockAuth, user: { id: 1 }, serverUrl: 'https://two.invalid' }; view.rerender({});
    expect(view.result.current.data).toEqual([]);
    await waitFor(() => expect(mockGetFoodLog).toHaveBeenCalled());
    view.unmount(); client.clear();
});
