import { api } from './client';
import type { DailyWeight, FoodEntry, Summary, User } from './types';

export async function fetchMe(): Promise<User> {
  const res = await api.get('/auth/me');
  return res.data.user;
}

export async function fetchGoals() {
  const res = await api.get('/goals');
  return res.data as { currentWeight?: number | null; targetWeight?: number | null; targetCalorieDeficit?: number | null };
}

export async function updateGoals(payload: {
  currentWeight?: number | null;
  targetWeight?: number | null;
  targetCalorieDeficit?: number | null;
}) {
  const res = await api.put('/goals', payload);
  return res.data;
}

export async function logWeight(payload: { date?: string; weight: number }) {
  const res = await api.post('/weights', payload);
  return res.data as DailyWeight;
}

export async function fetchWeights() {
  const res = await api.get('/weights');
  return res.data as DailyWeight[];
}

export async function fetchFood(date?: string) {
  const res = await api.get('/food', { params: { date } });
  return res.data as FoodEntry[];
}

export async function addFood(payload: { date: string; label: string; calories: number; meal: FoodEntry['meal'] }) {
  const res = await api.post('/food', payload);
  return res.data as FoodEntry;
}

export async function deleteFood(id: string) {
  await api.delete(`/food/${id}`);
}

export async function fetchSummary(date?: string) {
  const res = await api.get('/summary', { params: { date } });
  return res.data as Summary;
}

export async function fetchHistory(limit = 90) {
  const res = await api.get('/summary/history', { params: { limit } });
  return res.data as { weights: DailyWeight[] };
}
