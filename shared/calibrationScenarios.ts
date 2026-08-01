import type { CalibrationFoodDay, CalibrationInput, CalibrationWeightPoint } from './calibration';

export type CalibrationScenario = {
    id: string;
    name: string;
    description: string;
    input: CalibrationInput;
};

const AS_OF_DATE = '2026-07-31';

function addDays(date: string, delta: number): string {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + delta);
    return parsed.toISOString().slice(0, 10);
}

function buildFoodDays(options: {
    days: number;
    calories: number;
    missingEvery?: number;
    suspiciousEvery?: number;
    calorieDrift?: number;
}): CalibrationFoodDay[] {
    const result: CalibrationFoodDay[] = [];
    for (let offset = -(options.days - 1); offset <= 0; offset += 1) {
        const index = offset + options.days;
        if (options.missingEvery && index % options.missingEvery === 0) continue;
        const suspicious = Boolean(options.suspiciousEvery && index % options.suspiciousEvery === 0);
        result.push({
            date: addDays(AS_OF_DATE, offset),
            calories: Math.round(options.calories + (options.calorieDrift ?? 0) * index),
            entryCount: suspicious ? 1 : 5,
            mealPeriodCount: suspicious ? 1 : 3,
            isComplete: true
        });
    }
    return result;
}

function buildWeights(days: number, startWeightKg: number, weeklyChangeKg: number): CalibrationWeightPoint[] {
    const points: CalibrationWeightPoint[] = [];
    for (let offset = -(days - 1); offset <= 0; offset += 2) {
        const elapsed = offset + days - 1;
        const trendWeightKg = startWeightKg + (weeklyChangeKg * elapsed) / 7;
        points.push({
            date: addDays(AS_OF_DATE, offset),
            trendWeightKg,
            lowerKg: trendWeightKg - 0.04,
            upperKg: trendWeightKg + 0.04
        });
    }
    if (points[points.length - 1]?.date !== AS_OF_DATE) {
        const trendWeightKg = startWeightKg + (weeklyChangeKg * (days - 1)) / 7;
        points.push({ date: AS_OF_DATE, trendWeightKg, lowerKg: trendWeightKg - 0.04, upperKg: trendWeightKg + 0.04 });
    }
    return points;
}

const baseInput = {
    asOfDate: AS_OF_DATE,
    ageYears: 38,
    bmrKcal: 1650,
    profileTdeeKcal: 2400,
    configuredDailyDeficitKcal: 500,
    currentTargetAdjustmentKcal: 0
} as const;

export const CALIBRATION_SCENARIOS: CalibrationScenario[] = [
    {
        id: 'early-insight',
        name: 'Early 7-day insight',
        description: 'Good first-week tracking produces pace context but cannot change the target yet.',
        input: {
            ...baseInput,
            foodDays: buildFoodDays({ days: 7, calories: 1900 }),
            weightPoints: buildWeights(7, 90, -0.45)
        }
    },
    {
        id: 'on-track',
        name: 'On-track complete history',
        description: 'The configured target and observed weight pace agree.',
        input: {
            ...baseInput,
            foodDays: buildFoodDays({ days: 28, calories: 1900 }),
            weightPoints: buildWeights(28, 90, -0.455)
        }
    },
    {
        id: 'target-too-high',
        name: 'Target appears too high',
        description: 'Consistent target adherence with a slower trend supports a conservative decrease.',
        input: {
            ...baseInput,
            foodDays: buildFoodDays({ days: 28, calories: 1900 }),
            weightPoints: buildWeights(28, 90, -0.23)
        }
    },
    {
        id: 'adherence-not-target',
        name: 'Pace explained by intake',
        description: 'Higher logged intake explains the slower loss, so the target estimate itself is not blamed.',
        input: {
            ...baseInput,
            foodDays: buildFoodDays({ days: 28, calories: 2200 }),
            weightPoints: buildWeights(28, 90, -0.18)
        }
    },
    {
        id: 'missing-and-suspicious',
        name: 'Missing and suspicious days',
        description: 'Skipped days and one-entry completed days widen uncertainty instead of disappearing.',
        input: {
            ...baseInput,
            foodDays: buildFoodDays({ days: 28, calories: 1900, missingEvery: 4, suspiciousEvery: 5 }),
            weightPoints: buildWeights(28, 90, -0.2)
        }
    },
    {
        id: 'bmr-floor',
        name: 'BMR safety floor',
        description: 'Evidence points down, but the recommended target cannot cross the BMR floor.',
        input: {
            ...baseInput,
            bmrKcal: 1850,
            profileTdeeKcal: 2250,
            configuredDailyDeficitKcal: 250,
            currentTargetAdjustmentKcal: 0,
            foodDays: buildFoodDays({ days: 28, calories: 2000 }),
            weightPoints: buildWeights(28, 90, 0.05)
        }
    }
];

export function getCalibrationScenario(id: string): CalibrationScenario | undefined {
    return CALIBRATION_SCENARIOS.find((scenario) => scenario.id === id);
}
