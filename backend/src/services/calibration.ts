import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
    CALIBRATION_MODEL_VERSION,
    evaluateCalibration,
    type CalibrationFoodDay,
    type CalibrationInput,
    type CalibrationResult
} from '../../../shared/calibration';
import prisma from '../config/database';
import { ensureMaterializedWeightTrends } from './materializedWeightTrend';
import { computeWeightTrend } from './weightTrend';
import { getEffectiveCaloriePlan } from './caloriePlan';
import { calculateAge, buildCalorieSummary } from '../utils/profile';
import {
    addUtcDays,
    formatDateToLocalDateString,
    getSafeUtcTodayDateOnlyInTimeZone,
    parseLocalDateOnly
} from '../utils/date';
import {
    ClientOperationConflictError,
    executeIdempotentMutation,
    recordSyncChange
} from './clientOperations';

const CALIBRATION_HISTORY_DAYS = 90; // Includes the bounded personal intake reference horizon.
const CALIBRATION_WEIGHT_DAYS = 42;

type MaterializedRecommendation = {
    id: number;
    status: 'pending';
    inputFingerprint: string;
    effectiveLocalDate: string;
};

export type ScheduledCalibrationChange = {
    recommendationId: number | null;
    targetAdjustmentKcal: number;
    dailyCalorieBudgetKcal: number | null;
    effectiveLocalDate: string;
};

export type CalibrationStatus = {
    generatedAt: string;
    inputFingerprint: string | null;
    evaluation: CalibrationResult;
    recommendation: MaterializedRecommendation | null;
    scheduledChange: ScheduledCalibrationChange | null;
};

export class CalibrationConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CalibrationConflictError';
    }
}

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonicalize(entry)])
        );
    }
    return value instanceof Date ? value.toISOString() : value;
}

function fingerprintInput(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function buildUnavailableEvaluation(options: {
    asOfDate: string;
    headline: string;
    summary: string;
    missingCriteria: string[];
    weightUnit: 'KG' | 'LB';
    configuredDailyDeficitKcal?: number;
}): CalibrationResult {
    return {
        modelVersion: CALIBRATION_MODEL_VERSION,
        asOfDate: options.asOfDate,
        weightUnit: options.weightUnit,
        status: 'not_ready',
        headline: options.headline,
        summary: options.summary,
        nextStep: null,
        historyProgress: null,
        selectedWindowDays: null,
        dataQuality: {
            observationDays: 0,
            completeDays: 0,
            confidentDays: 0,
            suspiciousDays: 0,
            incompleteDays: 0,
            missingDays: 0,
            weightPoints: 0,
            weightSpanDays: 0
        },
        missingCriteria: options.missingCriteria,
        assumptions: [],
        estimates: {
            averageIntakeKcal: null,
            observedWeeklyWeightChangeKg: null,
            targetAdjustmentKcal: null,
            configuredWeeklyWeightChangeKg: -((options.configuredDailyDeficitKcal ?? 0) * 7) / 7700
        },
        recommendation: null,
        activityContext: null
    };
}

async function stalePendingRecommendations(userId: number): Promise<void> {
    await prisma.calibrationRecommendation.updateMany({
        where: { user_id: userId, status: 'PENDING' },
        data: { status: 'STALE' }
    });
}

function buildFoodEvidence(options: {
    logs: Array<{ local_date: Date; calories: number; meal_period: string }>;
    completionDays: Array<{ local_date: Date; status: string }>;
    planStartDate: string;
    asOfDate: string;
}): CalibrationFoodDay[] {
    const byDate = new Map<string, CalibrationFoodDay>();
    for (const completion of options.completionDays) {
        const date = toDateKey(completion.local_date);
        if (date < options.planStartDate || date > options.asOfDate) continue;
        byDate.set(date, {
            date,
            calories: 0,
            entryCount: 0,
            mealPeriodCount: 0,
            isComplete: completion.status === 'COMPLETE',
            isPaused: completion.status === 'PAUSED'
        });
    }
    const mealPeriodsByDate = new Map<string, Set<string>>();
    for (const log of options.logs) {
        const date = toDateKey(log.local_date);
        if (date < options.planStartDate || date > options.asOfDate) continue;
        const day = byDate.get(date) ?? {
            date,
            calories: 0,
            entryCount: 0,
            mealPeriodCount: 0,
            isComplete: false,
            isPaused: false
        };
        day.calories += log.calories;
        day.entryCount += 1;
        const mealPeriods = mealPeriodsByDate.get(date) ?? new Set<string>();
        mealPeriods.add(log.meal_period);
        mealPeriodsByDate.set(date, mealPeriods);
        day.mealPeriodCount = mealPeriods.size;
        byDate.set(date, day);
    }
    return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildWeightEvidence(options: {
    rows: Array<{
        date: Date;
        weight_grams: number;
        trend: {
            trend_weight_grams: number;
            trend_ci_lower_grams: number;
            trend_ci_upper_grams: number;
        } | null;
    }>;
    planStartDate: string;
    latestPausedDate: string | null;
}): CalibrationInput['weightPoints'] {
    const rows = options.rows.filter((row) => {
        const date = toDateKey(row.date);
        return date >= options.planStartDate && (!options.latestPausedDate || date > options.latestPausedDate);
    });
    if (!options.latestPausedDate) {
        return rows.map((row) => ({
            date: toDateKey(row.date),
            trendWeightKg: (row.trend?.trend_weight_grams ?? row.weight_grams) / 1000,
            lowerKg: (row.trend?.trend_ci_lower_grams ?? row.weight_grams) / 1000,
            upperKg: (row.trend?.trend_ci_upper_grams ?? row.weight_grams) / 1000
        }));
    }

    // A post-pause pace must not inherit smoothing state from weights recorded before the break.
    return computeWeightTrend(rows.map((row) => ({
        date: row.date,
        weight: row.weight_grams / 1000
    }))).points.map((point) => ({
        date: toDateKey(point.date),
        trendWeightKg: point.trendWeight,
        lowerKg: point.lower95,
        upperKg: point.upper95
    }));
}

async function materializeRecommendation(options: {
    userId: number;
    goalId: number;
    inputFingerprint: string;
    asOfDate: Date;
    effectiveLocalDate: Date;
    evaluation: CalibrationResult;
}): Promise<MaterializedRecommendation | null> {
    const suggested = options.evaluation.recommendation;
    if (!suggested) {
        await stalePendingRecommendations(options.userId);
        return null;
    }

    const recommendation = await prisma.$transaction(async (tx) => {
        await tx.calibrationRecommendation.updateMany({
            where: {
                user_id: options.userId,
                status: 'PENDING',
                input_fingerprint: { not: options.inputFingerprint }
            },
            data: { status: 'STALE' }
        });
        return tx.calibrationRecommendation.upsert({
            where: {
                user_id_input_fingerprint: {
                    user_id: options.userId,
                    input_fingerprint: options.inputFingerprint
                }
            },
            update: {},
            create: {
                user_id: options.userId,
                source_goal_id: options.goalId,
                input_fingerprint: options.inputFingerprint,
                model_version: options.evaluation.modelVersion,
                as_of_local_date: options.asOfDate,
                current_target_adjustment_kcal: suggested.currentTargetAdjustmentKcal,
                recommended_target_adjustment_kcal: suggested.recommendedTargetAdjustmentKcal,
                current_target_kcal: suggested.currentTargetKcal,
                recommended_target_kcal: suggested.recommendedTargetKcal,
                result_snapshot: JSON.parse(JSON.stringify(options.evaluation)) as Prisma.InputJsonValue
            }
        });
    });

    if (recommendation.status !== 'PENDING') return null;
    return {
        id: recommendation.id,
        status: 'pending',
        inputFingerprint: recommendation.input_fingerprint,
        effectiveLocalDate: toDateKey(options.effectiveLocalDate)
    };
}

/** Compute and, when actionable, materialize the latest user-specific calibration status. */
export async function buildCalibrationStatus(userId: number, now = new Date()): Promise<CalibrationStatus> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            timezone: true,
            date_of_birth: true,
            sex: true,
            height_mm: true,
            activity_level: true,
            weight_unit: true
        }
    });
    if (!user) throw new CalibrationConflictError('User not found.');

    const today = getSafeUtcTodayDateOnlyInTimeZone(user.timezone, now);
    const todayCompletion = await prisma.foodLogDay.findUnique({
        where: { user_id_local_date: { user_id: userId, local_date: today } },
        select: { status: true }
    });
    // An in-progress current day is not evidence of a missing log. Once completed, it participates immediately.
    const asOfDate = todayCompletion?.status === 'COMPLETE' ? today : addUtcDays(today, -1);
    const asOfDateKey = toDateKey(asOfDate);
    const generatedAt = now.toISOString();

    const goal = await prisma.goal.findFirst({
        where: { user_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }]
    });
    if (!goal || goal.daily_deficit <= 0) {
        await stalePendingRecommendations(userId);
        return {
            generatedAt,
            inputFingerprint: null,
            evaluation: buildUnavailableEvaluation({
                asOfDate: asOfDateKey,
                headline: 'Calibration is available for active weight-loss goals',
                summary: 'Choose a calorie-deficit goal before Calibrate evaluates weight-loss pacing.',
                missingCriteria: ['Set an active weight-loss goal with a daily calorie deficit.'],
                weightUnit: user.weight_unit,
                configuredDailyDeficitKcal: goal?.daily_deficit
            }),
            recommendation: null,
            scheduledChange: null
        };
    }

    await ensureMaterializedWeightTrends(userId);
    const historyStart = addUtcDays(asOfDate, -(CALIBRATION_HISTORY_DAYS - 1));
    const weightStart = addUtcDays(asOfDate, -(CALIBRATION_WEIGHT_DAYS - 1));
    const [latestMetric, currentPlan, scheduledRevision, logs, completionDays, weightRows] = await Promise.all([
        prisma.bodyMetric.findFirst({
            where: { user_id: userId, date: { lte: asOfDate } },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            select: { weight_grams: true }
        }),
        getEffectiveCaloriePlan(userId, goal.id, today),
        prisma.caloriePlanRevision.findFirst({
            where: { user_id: userId, source_goal_id: goal.id, effective_local_date: { gt: today } },
            orderBy: [{ effective_local_date: 'asc' }, { id: 'asc' }],
            select: { recommendation_id: true, target_adjustment_kcal: true, effective_local_date: true }
        }),
        prisma.foodLog.findMany({
            where: { user_id: userId, local_date: { gte: historyStart, lte: asOfDate } },
            orderBy: [{ local_date: 'asc' }, { id: 'asc' }],
            select: { local_date: true, calories: true, meal_period: true }
        }),
        prisma.foodLogDay.findMany({
            where: { user_id: userId, local_date: { gte: historyStart, lte: asOfDate } },
            orderBy: { local_date: 'asc' },
            select: { local_date: true, status: true }
        }),
        prisma.bodyMetric.findMany({
            where: { user_id: userId, date: { gte: weightStart, lte: asOfDate } },
            orderBy: [{ date: 'asc' }, { id: 'asc' }],
            select: {
                date: true,
                weight_grams: true,
                trend: {
                    select: {
                        trend_weight_grams: true,
                        trend_ci_lower_grams: true,
                        trend_ci_upper_grams: true
                    }
                }
            }
        })
    ]);

    const calorieSummary = buildCalorieSummary({
        weight_grams: latestMetric?.weight_grams,
        profile: user,
        daily_deficit: goal.daily_deficit,
        now: asOfDate
    });
    if (
        calorieSummary.bmr === undefined ||
        calorieSummary.tdee === undefined ||
        !user.date_of_birth
    ) {
        const missing = calorieSummary.missing.map((field) => `Complete profile field: ${field.replace(/_/g, ' ')}.`);
        await stalePendingRecommendations(userId);
        return {
            generatedAt,
            inputFingerprint: null,
            evaluation: buildUnavailableEvaluation({
                asOfDate: asOfDateKey,
                headline: 'Complete your calorie profile first',
                summary: 'Calibration needs the same profile and current-weight inputs used to establish your baseline target.',
                missingCriteria: missing,
                weightUnit: user.weight_unit,
                configuredDailyDeficitKcal: goal.daily_deficit
            }),
            recommendation: null,
            scheduledChange: scheduledRevision ? {
                recommendationId: scheduledRevision.recommendation_id,
                targetAdjustmentKcal: scheduledRevision.target_adjustment_kcal,
                dailyCalorieBudgetKcal: null,
                effectiveLocalDate: toDateKey(scheduledRevision.effective_local_date)
            } : null
        };
    }

    const goalStartDate = formatDateToLocalDateString(goal.created_at, user.timezone);
    const revisionStartDate = currentPlan ? toDateKey(currentPlan.effectiveLocalDate) : goalStartDate;
    const planStartDate = goalStartDate > revisionStartDate ? goalStartDate : revisionStartDate;
    const foodDays = buildFoodEvidence({ logs, completionDays, planStartDate, asOfDate: asOfDateKey });
    const latestPausedDate = foodDays
        .filter((day) => day.isPaused)
        .map((day) => day.date)
        .sort((left, right) => right.localeCompare(left))[0] ?? null;
    const input: CalibrationInput = {
        asOfDate: asOfDateKey,
        weightUnit: user.weight_unit,
        ageYears: calculateAge(user.date_of_birth, asOfDate),
        bmrKcal: calorieSummary.bmr,
        profileTdeeKcal: calorieSummary.tdee,
        configuredDailyDeficitKcal: goal.daily_deficit,
        currentTargetAdjustmentKcal: currentPlan?.targetAdjustmentKcal ?? 0,
        foodDays,
        trackingPaused: todayCompletion?.status === 'PAUSED',
        weightPoints: buildWeightEvidence({ rows: weightRows, planStartDate, latestPausedDate })
    };
    const evaluation = evaluateCalibration(input);
    const { weightUnit: _displayWeightUnit, ...actionEvidence } = input;
    const inputFingerprint = fingerprintInput({
        modelVersion: CALIBRATION_MODEL_VERSION,
        goalId: goal.id,
        planStartDate,
        actionEvidence
    });
    const scheduledChange = scheduledRevision ? {
        recommendationId: scheduledRevision.recommendation_id,
        targetAdjustmentKcal: scheduledRevision.target_adjustment_kcal,
        dailyCalorieBudgetKcal: Math.max(
            0,
            Math.round(calorieSummary.tdee - goal.daily_deficit + scheduledRevision.target_adjustment_kcal)
        ),
        effectiveLocalDate: toDateKey(scheduledRevision.effective_local_date)
    } : null;
    let recommendation: MaterializedRecommendation | null = null;
    if (scheduledChange) {
        await stalePendingRecommendations(userId);
    } else {
        recommendation = await materializeRecommendation({
            userId,
            goalId: goal.id,
            inputFingerprint,
            asOfDate,
            effectiveLocalDate: addUtcDays(today, 1),
            evaluation
        });
    }

    return { generatedAt, inputFingerprint, evaluation, recommendation, scheduledChange };
}

/** Revalidate and accept one current recommendation as a next-local-day plan revision. */
export async function applyCalibrationRecommendation(options: {
    userId: number;
    recommendationId: number;
    operationId?: string;
    now?: Date;
}): Promise<ScheduledCalibrationChange> {
    const existing = await prisma.calibrationRecommendation.findFirst({
        where: { id: options.recommendationId, user_id: options.userId },
        include: { plan_revision: true }
    });
    if (existing?.status === 'APPLIED' && existing.plan_revision) {
        return {
            recommendationId: existing.id,
            targetAdjustmentKcal: existing.plan_revision.target_adjustment_kcal,
            dailyCalorieBudgetKcal: existing.recommended_target_kcal,
            effectiveLocalDate: toDateKey(existing.plan_revision.effective_local_date)
        };
    }
    if (!existing || existing.status !== 'PENDING') {
        throw new CalibrationConflictError('This recommendation is no longer current. Refresh calibration before applying it.');
    }

    const status = await buildCalibrationStatus(options.userId, options.now);
    if (!status.recommendation || status.recommendation.id !== options.recommendationId) {
        throw new CalibrationConflictError('This recommendation is no longer current. Refresh calibration before applying it.');
    }
    const recommendation = await prisma.calibrationRecommendation.findFirst({
        where: { id: options.recommendationId, user_id: options.userId, status: 'PENDING' }
    });
    if (!recommendation || recommendation.input_fingerprint !== status.inputFingerprint) {
        throw new CalibrationConflictError('This recommendation is no longer current. Refresh calibration before applying it.');
    }

    const effectiveLocalDate = parseLocalDateOnly(status.recommendation.effectiveLocalDate);
    try {
        const result = await executeIdempotentMutation<ScheduledCalibrationChange>({
            userId: options.userId,
            operationId: options.operationId,
            operationKind: 'calibration_recommendation.apply',
            requestPayload: { recommendation_id: options.recommendationId },
            mutate: async (tx, claimedOperationId) => {
                const revision = await tx.caloriePlanRevision.create({
                    data: {
                        user_id: options.userId,
                        source_goal_id: recommendation.source_goal_id,
                        recommendation_id: recommendation.id,
                        target_adjustment_kcal: recommendation.recommended_target_adjustment_kcal,
                        effective_local_date: effectiveLocalDate
                    }
                });
                await tx.calibrationRecommendation.update({
                    where: { id: recommendation.id },
                    data: { status: 'APPLIED', applied_at: options.now ?? new Date() }
                });
                const body = {
                    recommendationId: recommendation.id,
                    targetAdjustmentKcal: revision.target_adjustment_kcal,
                    dailyCalorieBudgetKcal: recommendation.recommended_target_kcal,
                    effectiveLocalDate: toDateKey(revision.effective_local_date)
                };
                await recordSyncChange({
                    tx,
                    userId: options.userId,
                    entityType: 'calorie_plan_revision',
                    entityId: revision.id,
                    action: 'upsert',
                    operationId: claimedOperationId,
                    payload: body
                });
                return { status: 200, body };
            }
        });
        return result.body;
    } catch (error) {
        if (error instanceof ClientOperationConflictError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new CalibrationConflictError('This recommendation has already been applied.');
        }
        throw error;
    }
}

/** Undo a not-yet-effective calibration revision and restore its recommendation for review. */
export async function cancelScheduledCalibrationChange(options: {
    userId: number;
    recommendationId: number;
    operationId?: string;
    now?: Date;
}): Promise<CalibrationStatus> {
    const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { timezone: true }
    });
    if (!user) throw new CalibrationConflictError('User not found.');

    const today = getSafeUtcTodayDateOnlyInTimeZone(user.timezone, options.now ?? new Date());
    await executeIdempotentMutation<{ recommendationId: number; canceled: true }>({
        userId: options.userId,
        operationId: options.operationId,
        operationKind: 'calibration_recommendation.cancel',
        requestPayload: { recommendation_id: options.recommendationId },
        mutate: async (tx, claimedOperationId) => {
            const recommendation = await tx.calibrationRecommendation.findFirst({
                where: {
                    id: options.recommendationId,
                    user_id: options.userId,
                    status: 'APPLIED'
                },
                include: { plan_revision: true }
            });
            const revision = recommendation?.plan_revision;
            if (!recommendation || !revision) {
                throw new CalibrationConflictError('This calorie budget update is no longer scheduled. Refresh calibration to see the latest plan.');
            }
            if (revision.effective_local_date <= today) {
                throw new CalibrationConflictError('This calorie budget update has already started and can no longer be undone as a scheduled change.');
            }

            await tx.caloriePlanRevision.delete({ where: { id: revision.id } });
            await tx.calibrationRecommendation.update({
                where: { id: recommendation.id },
                data: { status: 'PENDING', applied_at: null }
            });
            await recordSyncChange({
                tx,
                userId: options.userId,
                entityType: 'calorie_plan_revision',
                entityId: revision.id,
                action: 'delete',
                operationId: claimedOperationId,
                payload: {
                    recommendationId: recommendation.id,
                    effectiveLocalDate: toDateKey(revision.effective_local_date)
                }
            });
            return {
                status: 200,
                body: { recommendationId: recommendation.id, canceled: true }
            };
        }
    });

    return buildCalibrationStatus(options.userId, options.now);
}
