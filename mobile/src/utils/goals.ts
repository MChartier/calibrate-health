export type GoalMode = 'lose' | 'maintain' | 'gain';

const CALORIES_PER_POUND = 3500;
const CALORIES_PER_KILOGRAM = 7700;

export function getGoalModeFromDailyDeficit(dailyDeficit: number): GoalMode {
    if (dailyDeficit === 0) return 'maintain';
    return dailyDeficit > 0 ? 'lose' : 'gain';
}

export function computeGoalProgress(args: {
    startWeight: number;
    targetWeight: number;
    currentWeight: number | null;
}): { percent: number; isComplete: boolean } | null {
    const { startWeight, targetWeight, currentWeight } = args;
    if (typeof currentWeight !== 'number' || !Number.isFinite(currentWeight)) return null;

    const totalDelta = targetWeight - startWeight;
    const achievedDelta = currentWeight - startWeight;
    if (totalDelta === 0) {
        const isComplete = Math.abs(currentWeight - targetWeight) <= 0.1;
        return { percent: isComplete ? 100 : 0, isComplete };
    }

    const percent = Math.max(0, Math.min(100, (achievedDelta / totalDelta) * 100));
    const isComplete = totalDelta > 0 ? currentWeight >= targetWeight : currentWeight <= targetWeight;
    return { percent, isComplete };
}

export function computeGoalProjection(args: {
    targetWeight: number;
    currentWeight: number | null;
    startWeight: number;
    dailyDeficit: number;
    unitLabel: string;
}): string {
    const { dailyDeficit, targetWeight, currentWeight, startWeight, unitLabel } = args;
    if (dailyDeficit === 0) return 'No projection for maintenance.';

    const baseline = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : startWeight;
    const remaining = dailyDeficit > 0 ? Math.max(0, baseline - targetWeight) : Math.max(0, targetWeight - baseline);
    const caloriesPerUnit = unitLabel === 'lb' ? CALORIES_PER_POUND : CALORIES_PER_KILOGRAM;
    const days = remaining === 0 ? 0 : Math.ceil((remaining * caloriesPerUnit) / Math.abs(dailyDeficit));
    const projected = new Date();
    projected.setDate(projected.getDate() + days);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(projected);
}
