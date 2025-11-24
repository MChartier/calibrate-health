export type MealCategory = 'BREAKFAST' | 'MORNING' | 'LUNCH' | 'AFTERNOON' | 'DINNER' | 'EVENING';

export interface User {
  id: string;
  email: string;
  currentWeight?: number | null;
  targetWeight?: number | null;
  targetCalorieDeficit?: number | null;
}

export interface FoodEntry {
  id: string;
  date: string;
  label: string;
  calories: number;
  meal: MealCategory;
}

export interface DailyWeight {
  id: string;
  date: string;
  weight: number;
}

export interface Summary {
  date: string;
  caloriesIn: number;
  caloriesOutEstimate: number;
  netCalories: number;
  targetDeficit: number;
  projectedGoalDate: string | null;
  weight: number | null;
}
