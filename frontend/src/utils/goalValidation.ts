export type GoalMode = 'lose' | 'maintain' | 'gain';

/**
 * Validate that the selected goal type is consistent with the provided weights.
 *
 * Returns null when valid; otherwise returns a user-facing error message.
 */
export function validateGoalWeights(opts: {
    goalMode: GoalMode;
    startWeight: number;
    targetWeight: number;
}): string | null {
    const { goalMode, startWeight, targetWeight } = opts;

    if (!Number.isFinite(startWeight) || startWeight <= 0) {
        return 'Start weight must be a positive number.';
    }

    if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
        return 'Target weight must be a positive number.';
    }

    // Match server-side rounding behavior (stored weights are rounded to the nearest 0.1 unit).
    const roundedStart = Math.round(startWeight * 10) / 10;
    const roundedTarget = Math.round(targetWeight * 10) / 10;

    if (goalMode === 'lose' && roundedTarget >= roundedStart) {
        return 'For a weight loss goal, target weight must be less than your start weight.';
    }

    if (goalMode === 'gain' && roundedTarget <= roundedStart) {
        return 'For a weight gain goal, target weight must be greater than your start weight.';
    }

    return null;
}
