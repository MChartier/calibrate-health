export const CALIBRATION_MODEL_VERSION = 2;
export const CALIBRATION_MAX_OBSERVATION_DAYS = 42;
export const CALIBRATION_REFERENCE_DAYS = 90;
export const CALIBRATION_MIN_INSIGHT_DAYS = 7;
export const CALIBRATION_MIN_ACTIONABLE_DAYS = 14;
export const CALIBRATION_MAX_ADJUSTMENT_STEP_KCAL = 150;
export const CALIBRATION_MIN_TARGET_KCAL = 1000;
export const CALIBRATION_BOOTSTRAP_REPLICATES = 400;

const KCAL_PER_KILOGRAM = 7700;
const ACTION_THRESHOLD_KCAL = 75;
const MAX_ACTIONABLE_INTERVAL_WIDTH_KCAL = 300;
const OBSERVATION_WINDOWS = [14, 21, 28, 35, 42] as const;

export type CalibrationFoodDay = {
    date: string;
    calories: number;
    entryCount: number;
    mealPeriodCount: number;
    isComplete: boolean;
};

export type CalibrationWeightPoint = {
    date: string;
    trendWeightKg: number;
    lowerKg: number;
    upperKg: number;
};

export type CalibrationActivityDay = {
    date: string;
    steps?: number | null;
    activeCaloriesKcal?: number | null;
};

export type CalibrationInput = {
    asOfDate: string;
    ageYears: number;
    bmrKcal: number;
    profileTdeeKcal: number;
    configuredDailyDeficitKcal: number;
    currentTargetAdjustmentKcal: number;
    foodDays: CalibrationFoodDay[];
    weightPoints: CalibrationWeightPoint[];
    activityDays?: CalibrationActivityDay[];
};

export type CalibrationInterval = {
    low: number;
    midpoint: number;
    high: number;
};

export type CalibrationDataQuality = {
    observationDays: number;
    completeDays: number;
    confidentDays: number;
    suspiciousDays: number;
    incompleteDays: number;
    missingDays: number;
    weightPoints: number;
    weightSpanDays: number;
};

export type CalibrationRecommendation = {
    currentTargetKcal: number;
    recommendedTargetKcal: number;
    adjustmentStepKcal: number;
    currentTargetAdjustmentKcal: number;
    recommendedTargetAdjustmentKcal: number;
};

export type CalibrationResult = {
    modelVersion: number;
    asOfDate: string;
    status: 'not_ready' | 'learning' | 'insight' | 'recommendation';
    headline: string;
    summary: string;
    selectedWindowDays: number | null;
    dataQuality: CalibrationDataQuality;
    missingCriteria: string[];
    assumptions: string[];
    estimates: {
        averageIntakeKcal: CalibrationInterval | null;
        observedWeeklyWeightChangeKg: CalibrationInterval | null;
        targetAdjustmentKcal: CalibrationInterval | null;
        configuredWeeklyWeightChangeKg: number;
    };
    recommendation: CalibrationRecommendation | null;
    activityContext: {
        observedDays: number;
        averageSteps: number | null;
        averageActiveCaloriesKcal: number | null;
    } | null;
};

type ClassifiedFoodDay = CalibrationFoodDay & {
    classification: 'confident' | 'suspicious' | 'incomplete' | 'missing';
    low: number;
    high: number;
};

type WindowEvaluation = {
    windowDays: number;
    dataQuality: CalibrationDataQuality;
    averageIntake: CalibrationInterval | null;
    weeklyWeightChange: CalibrationInterval | null;
    targetAdjustment: CalibrationInterval | null;
    recommendation: CalibrationRecommendation | null;
    actionable: boolean;
    missingCriteria: string[];
};

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

function round(value: number, precision = 1): number {
    const scale = 10 ** precision;
    return Math.round(value * scale) / scale;
}

function addDateDays(date: string, delta: number): string {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + delta);
    return parsed.toISOString().slice(0, 10);
}

function inclusiveDateSpan(start: string, end: string): number {
    const startMs = new Date(`${start}T00:00:00.000Z`).getTime();
    const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
    return Math.max(0, Math.round((endMs - startMs) / 86_400_000) + 1);
}

function quantile(sorted: number[], fraction: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const position = (sorted.length - 1) * fraction;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const portion = position - lowerIndex;
    return sorted[lowerIndex] * (1 - portion) + sorted[upperIndex] * portion;
}

function interval(values: number[], precision = 1): CalibrationInterval | null {
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    return {
        low: round(quantile(sorted, 0.025), precision),
        midpoint: round(quantile(sorted, 0.5), precision),
        high: round(quantile(sorted, 0.975), precision)
    };
}

function seedFromInput(input: CalibrationInput, windowDays: number): number {
    const canonical = JSON.stringify({
        asOfDate: input.asOfDate,
        windowDays,
        bmrKcal: input.bmrKcal,
        profileTdeeKcal: input.profileTdeeKcal,
        configuredDailyDeficitKcal: input.configuredDailyDeficitKcal,
        currentTargetAdjustmentKcal: input.currentTargetAdjustmentKcal,
        foodDays: input.foodDays,
        weightPoints: input.weightPoints
    });
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
        hash ^= canonical.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createRandom(seed: number): () => number {
    let state = seed || 0x6d2b79f5;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function getReferenceIntakeBounds(input: CalibrationInput): { low: number; midpoint: number; high: number } {
    const referenceStart = addDateDays(input.asOfDate, -(CALIBRATION_REFERENCE_DAYS - 1));
    const plausibleMinimum = Math.max(600, input.bmrKcal * 0.45);
    const plausibleMaximum = Math.max(4500, input.profileTdeeKcal * 1.8);
    const confidentCalories = input.foodDays
        .filter((day) =>
            day.date >= referenceStart &&
            day.date <= input.asOfDate &&
            day.isComplete &&
            day.entryCount >= 2 &&
            day.mealPeriodCount >= 2 &&
            day.calories >= plausibleMinimum &&
            day.calories <= plausibleMaximum
        )
        .map((day) => day.calories)
        .sort((a, b) => a - b);

    if (confidentCalories.length < 3) {
        const midpoint = input.profileTdeeKcal - input.configuredDailyDeficitKcal + input.currentTargetAdjustmentKcal;
        return {
            low: Math.max(plausibleMinimum, midpoint - 350),
            midpoint,
            high: Math.min(plausibleMaximum, midpoint + 750)
        };
    }

    const q1 = quantile(confidentCalories, 0.25);
    const median = quantile(confidentCalories, 0.5);
    const q3 = quantile(confidentCalories, 0.75);
    const iqr = Math.max(100, q3 - q1);
    return {
        low: clamp(q1 - Math.max(200, iqr), plausibleMinimum, plausibleMaximum),
        midpoint: clamp(median, plausibleMinimum, plausibleMaximum),
        high: clamp(q3 + Math.max(500, iqr * 2), plausibleMinimum, plausibleMaximum)
    };
}

function classifyFoodDays(input: CalibrationInput, windowDays: number): ClassifiedFoodDay[] {
    const startDate = addDateDays(input.asOfDate, -(windowDays - 1));
    const sourceByDate = new Map(input.foodDays.map((day) => [day.date, day]));
    const reference = getReferenceIntakeBounds(input);
    const currentTarget = input.profileTdeeKcal - input.configuredDailyDeficitKcal + input.currentTargetAdjustmentKcal;
    const plausibleMinimum = Math.max(600, input.bmrKcal * 0.45);
    const plausibleMaximum = Math.max(4500, input.profileTdeeKcal * 1.8);
    const result: ClassifiedFoodDay[] = [];

    for (let offset = 0; offset < windowDays; offset += 1) {
        const date = addDateDays(startDate, offset);
        const source = sourceByDate.get(date);
        if (!source) {
            result.push({
                date,
                calories: 0,
                entryCount: 0,
                mealPeriodCount: 0,
                isComplete: false,
                classification: 'missing',
                // A skipped log is conservatively treated as at least a typical/target day, not as zero intake.
                low: Math.max(reference.midpoint, currentTarget),
                high: Math.min(plausibleMaximum, Math.max(reference.high, currentTarget + 750))
            });
            continue;
        }

        const structurallyPlausible =
            source.entryCount >= 2 &&
            source.mealPeriodCount >= 2 &&
            source.calories >= plausibleMinimum &&
            source.calories <= plausibleMaximum;
        if (source.isComplete && structurallyPlausible) {
            const trackingAllowance = Math.max(75, source.calories * 0.05);
            result.push({
                ...source,
                classification: 'confident',
                low: Math.max(0, source.calories - trackingAllowance),
                high: source.calories + trackingAllowance
            });
            continue;
        }

        if (source.isComplete) {
            result.push({
                ...source,
                classification: 'suspicious',
                low: Math.max(source.calories, reference.low * 0.75),
                high: Math.min(plausibleMaximum, Math.max(reference.high, source.calories + 500))
            });
            continue;
        }

        result.push({
            ...source,
            classification: 'incomplete',
            low: Math.max(0, source.calories),
            high: Math.min(plausibleMaximum, Math.max(reference.high, source.calories + 750))
        });
    }

    return result;
}

function summarizeDataQuality(days: ClassifiedFoodDay[], weights: CalibrationWeightPoint[]): CalibrationDataQuality {
    const firstWeight = weights[0];
    const lastWeight = weights[weights.length - 1];
    return {
        observationDays: days.length,
        completeDays: days.filter((day) => day.isComplete).length,
        confidentDays: days.filter((day) => day.classification === 'confident').length,
        suspiciousDays: days.filter((day) => day.classification === 'suspicious').length,
        incompleteDays: days.filter((day) => day.classification === 'incomplete').length,
        missingDays: days.filter((day) => day.classification === 'missing').length,
        weightPoints: weights.length,
        weightSpanDays: firstWeight && lastWeight ? inclusiveDateSpan(firstWeight.date, lastWeight.date) : 0
    };
}

function evaluateWindow(input: CalibrationInput, windowDays: number): WindowEvaluation {
    const startDate = addDateDays(input.asOfDate, -(windowDays - 1));
    const days = classifyFoodDays(input, windowDays);
    const weights = input.weightPoints
        .filter((point) => point.date >= startDate && point.date <= input.asOfDate)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
    const dataQuality = summarizeDataQuality(days, weights);
    const missingCriteria: string[] = [];

    if (input.ageYears < 18) missingCriteria.push('Calibration recommendations are currently available to adults only.');
    if (dataQuality.weightPoints < 2 || dataQuality.weightSpanDays < CALIBRATION_MIN_INSIGHT_DAYS) {
        missingCriteria.push('Record weights spanning at least 7 days so a pace can be estimated.');
    } else if (dataQuality.weightPoints < 3) {
        missingCriteria.push('Record at least 3 weights before a target change can be suggested.');
    }
    if (dataQuality.confidentDays < Math.min(7, windowDays)) {
        missingCriteria.push('Complete at least 7 plausible food-log days with entries across multiple meals.');
    }

    const firstWeight = weights[0];
    const lastWeight = weights[weights.length - 1];
    if (!firstWeight || !lastWeight || dataQuality.weightSpanDays < 2) {
        return {
            windowDays,
            dataQuality,
            averageIntake: null,
            weeklyWeightChange: null,
            targetAdjustment: null,
            recommendation: null,
            actionable: false,
            missingCriteria
        };
    }

    const random = createRandom(seedFromInput(input, windowDays));
    const averageIntakeSamples: number[] = [];
    const weeklyWeightChangeSamples: number[] = [];
    const adjustmentSamples: number[] = [];
    const weightSpanDays = Math.max(1, inclusiveDateSpan(firstWeight.date, lastWeight.date) - 1);

    for (let replicate = 0; replicate < CALIBRATION_BOOTSTRAP_REPLICATES; replicate += 1) {
        let intakeTotal = 0;
        for (let sampleIndex = 0; sampleIndex < days.length; sampleIndex += 1) {
            const sampledDay = days[Math.floor(random() * days.length)];
            intakeTotal += sampledDay.low + random() * (sampledDay.high - sampledDay.low);
        }
        const averageIntake = intakeTotal / days.length;
        const sampledStartWeight = firstWeight.lowerKg + random() * (firstWeight.upperKg - firstWeight.lowerKg);
        const sampledEndWeight = lastWeight.lowerKg + random() * (lastWeight.upperKg - lastWeight.lowerKg);
        const dailyWeightChange = (sampledEndWeight - sampledStartWeight) / weightSpanDays;
        const observedDeficit = -dailyWeightChange * KCAL_PER_KILOGRAM;
        const targetAdjustment = averageIntake + observedDeficit - input.profileTdeeKcal;

        averageIntakeSamples.push(averageIntake);
        weeklyWeightChangeSamples.push(dailyWeightChange * 7);
        adjustmentSamples.push(targetAdjustment);
    }

    const averageIntake = interval(averageIntakeSamples);
    const weeklyWeightChange = interval(weeklyWeightChangeSamples, 3);
    const targetAdjustment = interval(adjustmentSamples);
    let recommendation: CalibrationRecommendation | null = null;
    let actionable = false;

    if (targetAdjustment) {
        const intervalWidth = targetAdjustment.high - targetAdjustment.low;
        const currentAdjustment = input.currentTargetAdjustmentKcal;
        const intervalSupportsDecrease = targetAdjustment.high < currentAdjustment - ACTION_THRESHOLD_KCAL;
        const intervalSupportsIncrease = targetAdjustment.low > currentAdjustment + ACTION_THRESHOLD_KCAL;
        const supportsChange = intervalSupportsDecrease || intervalSupportsIncrease;
        const hasMinimumHistory =
            windowDays >= CALIBRATION_MIN_ACTIONABLE_DAYS &&
            dataQuality.weightSpanDays >= CALIBRATION_MIN_ACTIONABLE_DAYS &&
            dataQuality.weightPoints >= 3 &&
            dataQuality.confidentDays >= 7;
        actionable =
            input.ageYears >= 18 &&
            hasMinimumHistory &&
            intervalWidth <= MAX_ACTIONABLE_INTERVAL_WIDTH_KCAL &&
            supportsChange;

        if (supportsChange && (windowDays < CALIBRATION_MIN_ACTIONABLE_DAYS || dataQuality.weightSpanDays < CALIBRATION_MIN_ACTIONABLE_DAYS)) {
            missingCriteria.push('Track food and weight across at least 14 days before a target change can be suggested.');
        }

        let floorBlocksDecrease = false;
        if (actionable) {
            const rawStep = targetAdjustment.midpoint - currentAdjustment;
            const boundedStep = clamp(rawStep, -CALIBRATION_MAX_ADJUSTMENT_STEP_KCAL, CALIBRATION_MAX_ADJUSTMENT_STEP_KCAL);
            let roundedStep = Math.round(boundedStep / 25) * 25;
            const baseTarget = input.profileTdeeKcal - input.configuredDailyDeficitKcal;
            const currentTarget = baseTarget + currentAdjustment;
            const minimumTarget = Math.max(input.bmrKcal, CALIBRATION_MIN_TARGET_KCAL);
            if (roundedStep < 0) {
                const maximumDecrease = Math.max(0, currentTarget - minimumTarget);
                if (maximumDecrease < 25) {
                    floorBlocksDecrease = true;
                    actionable = false;
                } else {
                    roundedStep = Math.max(roundedStep, -Math.floor(maximumDecrease / 25) * 25);
                }
            }

            if (actionable && Math.abs(roundedStep) >= 25) {
                const recommendedAdjustment = currentAdjustment + roundedStep;
                recommendation = {
                    currentTargetKcal: Math.round(currentTarget),
                    recommendedTargetKcal: Math.round(baseTarget + recommendedAdjustment),
                    adjustmentStepKcal: roundedStep,
                    currentTargetAdjustmentKcal: currentAdjustment,
                    recommendedTargetAdjustmentKcal: recommendedAdjustment
                };
            } else {
                actionable = false;
            }
        }

        if (floorBlocksDecrease) {
            missingCriteria.push('The current target is already at or below the calibration safety floor, so no lower target can be suggested.');
        }

        if (hasMinimumHistory && intervalWidth > MAX_ACTIONABLE_INTERVAL_WIDTH_KCAL) {
            missingCriteria.push('The plausible calorie range is still too wide for a safe target change.');
        }
        if (dataQuality.suspiciousDays > 0) {
            const count = dataQuality.suspiciousDays;
            missingCriteria.push(`${count} completed day${count === 1 ? '' : 's'} ${count === 1 ? 'looks' : 'look'} incomplete and ${count === 1 ? 'widens' : 'widen'} the estimate.`);
        }
        if (dataQuality.missingDays > 0 || dataQuality.incompleteDays > 0) {
            const uncertainDays = dataQuality.missingDays + dataQuality.incompleteDays;
            missingCriteria.push(`${uncertainDays} uncompleted or missing day${uncertainDays === 1 ? '' : 's'} ${uncertainDays === 1 ? 'widens' : 'widen'} the estimate.`);
        }
    }

    return {
        windowDays,
        dataQuality,
        averageIntake,
        weeklyWeightChange,
        targetAdjustment,
        recommendation,
        actionable: actionable && recommendation !== null,
        missingCriteria: Array.from(new Set(missingCriteria))
    };
}

function summarizeActivity(input: CalibrationInput, windowDays: number | null): CalibrationResult['activityContext'] {
    if (!input.activityDays || input.activityDays.length === 0 || windowDays === null) return null;
    const startDate = addDateDays(input.asOfDate, -(windowDays - 1));
    const days = input.activityDays.filter((day) => day.date >= startDate && day.date <= input.asOfDate);
    if (days.length === 0) return null;
    const steps = days.flatMap((day) => typeof day.steps === 'number' ? [day.steps] : []);
    const activeCalories = days.flatMap((day) => typeof day.activeCaloriesKcal === 'number' ? [day.activeCaloriesKcal] : []);
    return {
        observedDays: days.length,
        averageSteps: steps.length > 0 ? Math.round(steps.reduce((sum, value) => sum + value, 0) / steps.length) : null,
        averageActiveCaloriesKcal: activeCalories.length > 0
            ? Math.round(activeCalories.reduce((sum, value) => sum + value, 0) / activeCalories.length)
            : null
    };
}

function emptyQuality(): CalibrationDataQuality {
    return {
        observationDays: 0,
        completeDays: 0,
        confidentDays: 0,
        suspiciousDays: 0,
        incompleteDays: 0,
        missingDays: 0,
        weightPoints: 0,
        weightSpanDays: 0
    };
}

function describeRecommendationPace(observedWeeklyKg: number, configuredWeeklyKg: number): string {
    if (configuredWeeklyKg < -0.01) {
        return observedWeeklyKg < configuredWeeklyKg
            ? 'Weight loss is trending faster than projected'
            : 'Weight loss is trending slower than projected';
    }
    if (configuredWeeklyKg > 0.01) {
        return observedWeeklyKg > configuredWeeklyKg
            ? 'Weight gain is trending faster than projected'
            : 'Weight gain is trending slower than projected';
    }
    if (observedWeeklyKg < -0.01) return 'Weight is trending down instead of staying steady';
    return 'Weight is trending up instead of staying steady';
}

function describeWeeklyTrend(weeklyKg: number): string {
    if (Math.abs(weeklyKg) <= 0.01) return 'weight stayed about steady';
    return `weight trended ${weeklyKg < 0 ? 'down' : 'up'} about ${Math.abs(weeklyKg).toFixed(2)} kg per week`;
}

function describeProjectedWeeklyTrend(weeklyKg: number): string {
    if (Math.abs(weeklyKg) <= 0.01) return 'staying steady as projected';
    return `${Math.abs(weeklyKg).toFixed(2)} kg per week projected`;
}

/**
 * Evaluate recent intake and weight evidence without mutating state.
 *
 * Missing or suspicious food days are represented as conservative intake ranges instead of
 * being silently discarded. The shortest window with a sufficiently narrow interval wins;
 * otherwise the longest available window powers a descriptive, non-actionable insight.
 */
export function evaluateCalibration(input: CalibrationInput): CalibrationResult {
    const configuredWeeklyWeightChangeKg = round((-input.configuredDailyDeficitKcal * 7) / KCAL_PER_KILOGRAM, 3);
    const availableSpan = Math.min(
        CALIBRATION_MAX_OBSERVATION_DAYS,
        Math.max(
            0,
            ...input.foodDays.map((day) => inclusiveDateSpan(day.date, input.asOfDate)),
            ...input.weightPoints.map((point) => inclusiveDateSpan(point.date, input.asOfDate))
        )
    );

    if (availableSpan < CALIBRATION_MIN_INSIGHT_DAYS) {
        const previewDays = availableSpan > 0 ? classifyFoodDays(input, availableSpan) : [];
        const previewStart = addDateDays(input.asOfDate, -(Math.max(1, availableSpan) - 1));
        const previewWeights = input.weightPoints
            .filter((point) => point.date >= previewStart && point.date <= input.asOfDate)
            .slice()
            .sort((left, right) => left.date.localeCompare(right.date));
        return {
            modelVersion: CALIBRATION_MODEL_VERSION,
            asOfDate: input.asOfDate,
            status: 'not_ready',
            headline: 'Building your calibration history',
            summary: `Track food and weight across ${CALIBRATION_MIN_INSIGHT_DAYS} days to unlock an initial pace insight.`,
            selectedWindowDays: null,
            dataQuality: availableSpan > 0 ? summarizeDataQuality(previewDays, previewWeights) : emptyQuality(),
            missingCriteria: ['Track food and weight across at least 7 days.'],
            assumptions: [],
            estimates: {
                averageIntakeKcal: null,
                observedWeeklyWeightChangeKg: null,
                targetAdjustmentKcal: null,
                configuredWeeklyWeightChangeKg
            },
            recommendation: null,
            activityContext: null
        };
    }

    const candidateWindows = OBSERVATION_WINDOWS.filter((days) => days <= availableSpan);
    const descriptiveWindow = Math.max(CALIBRATION_MIN_INSIGHT_DAYS, ...candidateWindows, Math.min(availableSpan, 13));
    const evaluations = Array.from(new Set<number>([descriptiveWindow, ...candidateWindows]))
        .sort((left, right) => left - right)
        .map((days) => evaluateWindow(input, days));
    const selected = evaluations.find((candidate) => candidate.actionable)
        ?? evaluations.slice().sort((left, right) => right.windowDays - left.windowDays)[0];
    const hasPace = selected.weeklyWeightChange !== null && selected.dataQuality.weightSpanDays >= CALIBRATION_MIN_INSIGHT_DAYS;
    const hasFoodEvidence = selected.dataQuality.confidentDays > 0;
    const recommendation = selected.recommendation;

    let status: CalibrationResult['status'];
    let headline: string;
    let summary: string;
    if (!hasPace || !hasFoodEvidence) {
        status = 'learning';
        headline = 'More consistent evidence is needed';
        summary = 'Keep logging food across multiple meals and recording weights. Missing days remain part of the uncertainty rather than being ignored.';
    } else if (recommendation) {
        status = 'recommendation';
        const observedWeekly = selected.weeklyWeightChange?.midpoint ?? 0;
        const averageIntake = Math.round(selected.averageIntake?.midpoint ?? 0).toLocaleString('en-US');
        const budgetDirection = recommendation.adjustmentStepKcal < 0 ? 'lower' : 'higher';
        headline = describeRecommendationPace(observedWeekly, configuredWeeklyWeightChangeKg);
        summary = `You logged about ${averageIntake} kcal per day, and ${describeWeeklyTrend(observedWeekly)} versus ${describeProjectedWeeklyTrend(configuredWeeklyWeightChangeKg)}. This suggests a ${Math.abs(recommendation.adjustmentStepKcal)} kcal ${budgetDirection} daily calorie budget could bring your pace closer to your goal.`;
    } else {
        status = 'insight';
        const weekly = selected.weeklyWeightChange?.midpoint ?? 0;
        const direction = weekly < -0.01 ? 'losing' : weekly > 0.01 ? 'gaining' : 'maintaining';
        if (selected.missingCriteria.length === 0) {
            headline = 'Your progress is tracking as expected';
            summary = `The trend currently indicates ${direction} about ${Math.abs(weekly).toFixed(2)} kg per week. The evidence shows progress is consistent with tracking expectations.`;
        } else {
            headline = 'Your latest pace is available';
            summary = `The trend currently indicates ${direction} about ${Math.abs(weekly).toFixed(2)} kg per week. More consistent evidence will make this comparison more reliable; see the remaining criteria.`;
        }
    }

    return {
        modelVersion: CALIBRATION_MODEL_VERSION,
        asOfDate: input.asOfDate,
        status,
        headline,
        summary,
        selectedWindowDays: selected.windowDays,
        dataQuality: selected.dataQuality,
        missingCriteria: selected.missingCriteria,
        assumptions: [
            'Weight change is converted using 7,700 kcal per kilogram.',
            'Completed multi-meal days receive a small tracking allowance.',
            'Missing and suspicious days use conservative personal intake ranges and are not treated as zero or discarded.',
            'Health Connect activity is context only and does not change the calorie estimate.'
        ],
        estimates: {
            averageIntakeKcal: selected.averageIntake,
            observedWeeklyWeightChangeKg: selected.weeklyWeightChange,
            targetAdjustmentKcal: selected.targetAdjustment,
            configuredWeeklyWeightChangeKg
        },
        recommendation,
        activityContext: summarizeActivity(input, selected.windowDays)
    };
}
