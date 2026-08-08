import { type Prisma } from '@prisma/client';
import prisma from '../config/database';
import { diagnosticsRegistry } from '../observability';
import { addUtcDays, getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';
import { computeWeightTrend, WEIGHT_TREND_MODEL_VERSION } from './weightTrend';

const GRAMS_PER_KILOGRAM = 1000; // Canonical storage-to-model conversion for trend persistence.
export const MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS = 120; // Keep trend modeling focused on recent weight behavior.
export const MATERIALIZED_TREND_WARMUP_DAYS = 30; // Extra context stabilizes the first active-window trend points.
export { WEIGHT_TREND_MODEL_VERSION };

type TrendPersistenceClient = Pick<typeof prisma, 'bodyMetric' | 'bodyMetricTrend' | 'user' | '$transaction'>;
type TrendReplacementClient = Pick<Prisma.TransactionClient, 'bodyMetricTrend'>;
type MetricHistoryRow = {
    id: number;
    user_id: number;
    date: Date;
    weight_grams: number;
};
type MaterializedTrendWindow = {
    activeStartDate: Date;
    modelStartDate: Date;
};

/**
 * Convert kilogram-domain model outputs to integer grams for persistence.
 */
function kilogramsToRoundedGrams(kilograms: number): number {
    return Math.round(kilograms * GRAMS_PER_KILOGRAM);
}

/** Convert a finite kilogram-per-day model rate to the floating-point grams/day persistence domain. */
function kilogramsPerDayToGramsPerDay(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value * GRAMS_PER_KILOGRAM : null;
}

/** Resolve today's date-only boundary in the account timezone unless a caller supplies an explicit as-of day. */
async function resolveTrendAsOfDate(
    userId: number,
    client: TrendPersistenceClient,
    explicitAsOfDate?: Date
): Promise<Date> {
    if (explicitAsOfDate) return explicitAsOfDate;

    const user = await client.user.findUnique({
        where: { id: userId },
        select: { timezone: true }
    });
    return getSafeUtcTodayDateOnlyInTimeZone(user?.timezone ?? 'UTC');
}

/**
 * Compute the active trend window and model warmup bounds from the latest metric date.
 */
export function getMaterializedTrendWindowFromLatestDate(latestMetricDate: Date): MaterializedTrendWindow {
    const activeStartDate = addUtcDays(latestMetricDate, -(MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS - 1));
    const modelStartDate = addUtcDays(activeStartDate, -MATERIALIZED_TREND_WARMUP_DAYS);
    return { activeStartDate, modelStartDate };
}

/**
 * Load only the metrics needed to model the active trend horizon.
 */
async function loadMetricsForModelWindow(
    userId: number,
    modelStartDate: Date,
    asOfDate: Date,
    client: TrendPersistenceClient
): Promise<MetricHistoryRow[]> {
    return client.bodyMetric.findMany({
        where: {
            user_id: userId,
            date: { gte: modelStartDate, lte: asOfDate }
        },
        orderBy: { date: 'asc' },
        select: { id: true, user_id: true, date: true, weight_grams: true }
    });
}

/**
 * Fetch the newest metric date so recompute can anchor the active horizon.
 */
async function findLatestMetricDate(
    userId: number,
    asOfDate: Date,
    client: TrendPersistenceClient
): Promise<Date | null> {
    const latestMetric = await client.bodyMetric.findFirst({
        where: { user_id: userId, date: { lte: asOfDate } },
        orderBy: { date: 'desc' },
        select: { date: true }
    });
    return latestMetric?.date ?? null;
}

/**
 * Build persistence rows only for dates in the active trend horizon.
 */
function buildActiveTrendRows(
    metricsForModelWindow: MetricHistoryRow[],
    activeStartDate: Date
): Array<{
    metric_id: number;
    user_id: number;
    date: Date;
    trend_weight_grams: number;
    trend_ci_lower_grams: number;
    trend_ci_upper_grams: number;
    trend_std_grams: number;
    trend_rate_grams_per_day: number | null;
    trend_rate_std_grams_per_day: number | null;
    model_version: number;
}> {
    const trendResult = computeWeightTrend(
        metricsForModelWindow.map((metric) => ({
            date: metric.date,
            weight: metric.weight_grams / GRAMS_PER_KILOGRAM
        }))
    );

    type TrendPointV2 = (typeof trendResult.points)[number] & {
        trendRatePerDay?: number;
        trendRateStdPerDay?: number;
    };
    const trendByDateMs = new Map<number, TrendPointV2>();
    for (const point of trendResult.points) {
        trendByDateMs.set(point.date.getTime(), point);
    }

    return metricsForModelWindow.flatMap((metric) => {
        if (metric.date < activeStartDate) return [];
        const point = trendByDateMs.get(metric.date.getTime());
        if (!point) return [];
        return [
            {
                metric_id: metric.id,
                user_id: metric.user_id,
                date: metric.date,
                trend_weight_grams: kilogramsToRoundedGrams(point.trendWeight),
                trend_ci_lower_grams: kilogramsToRoundedGrams(point.lower95),
                trend_ci_upper_grams: kilogramsToRoundedGrams(point.upper95),
                trend_std_grams: kilogramsToRoundedGrams(point.trendStd),
                trend_rate_grams_per_day: kilogramsPerDayToGramsPerDay(point.trendRatePerDay),
                trend_rate_std_grams_per_day: kilogramsPerDayToGramsPerDay(point.trendRateStdPerDay),
                model_version: WEIGHT_TREND_MODEL_VERSION
            }
        ];
    });
}

/**
 * Recompute and replace one user's materialized weight trend rows from current BodyMetric history.
 */
export async function recomputeAndStoreUserWeightTrends(
    userId: number,
    client: TrendPersistenceClient = prisma,
    explicitAsOfDate?: Date
): Promise<void> {
    const startedAt = Date.now();
    let outcome: 'success' | 'failure' = 'failure';
    try {
        const asOfDate = await resolveTrendAsOfDate(userId, client, explicitAsOfDate);
        const latestMetricDate = await findLatestMetricDate(userId, asOfDate, client);
        if (!latestMetricDate) {
            await client.$transaction(async (tx) => {
                await tx.bodyMetricTrend.deleteMany({
                    where: { user_id: userId }
                });
            });
            outcome = 'success';
            return;
        }

        const { activeStartDate, modelStartDate } = getMaterializedTrendWindowFromLatestDate(latestMetricDate);
        const metricsForModelWindow = await loadMetricsForModelWindow(userId, modelStartDate, asOfDate, client);
        const rows = buildActiveTrendRows(metricsForModelWindow, activeStartDate);

        await client.$transaction(async (tx: TrendReplacementClient) => {
            await tx.bodyMetricTrend.deleteMany({
                where: { user_id: userId }
            });

            if (rows.length > 0) {
                await tx.bodyMetricTrend.createMany({ data: rows });
            }
        });
        outcome = 'success';
    } finally {
        // Operational counters include only outcome and duration; raw weights never enter diagnostics.
        diagnosticsRegistry.recordOperation('weight_trend_recompute', outcome, Date.now() - startedAt);
    }
}

/**
 * Ensure active-horizon trend rows exist and match the active model version.
 */
export async function ensureMaterializedWeightTrends(userId: number, explicitAsOfDate?: Date): Promise<void> {
    const asOfDate = await resolveTrendAsOfDate(userId, prisma, explicitAsOfDate);
    const latestMetric = await prisma.bodyMetric.findFirst({
        where: { user_id: userId, date: { lte: asOfDate } },
        orderBy: { date: 'desc' },
        select: { date: true }
    });
    if (!latestMetric) return;

    const { activeStartDate } = getMaterializedTrendWindowFromLatestDate(latestMetric.date);
    const staleOrMissing = await prisma.bodyMetric.findFirst({
        where: {
            user_id: userId,
            date: { gte: activeStartDate, lte: asOfDate },
            OR: [{ trend: { is: null } }, { trend: { is: { model_version: { not: WEIGHT_TREND_MODEL_VERSION } } } }]
        },
        select: { id: true }
    });

    if (!staleOrMissing) return;
    await recomputeAndStoreUserWeightTrends(userId, prisma, asOfDate);
}

/**
 * Refresh trend rows after metric writes without blocking user data writes on transient failures.
 */
export async function refreshMaterializedWeightTrendsBestEffort(userId: number, explicitAsOfDate?: Date): Promise<void> {
    try {
        await recomputeAndStoreUserWeightTrends(userId, prisma, explicitAsOfDate);
    } catch {
        try {
            // Remove stale rows so read-time ensure can deterministically recompute on next trend fetch.
            await prisma.bodyMetricTrend.deleteMany({
                where: { user_id: userId }
            });
            console.warn(
                `Unable to refresh materialized weight trends for user ${userId}; existing trend rows were invalidated and will be recomputed on next trend read. Check weight_trend_recompute diagnostics and database health if this persists.`
            );
        } catch {
            console.warn(
                `Unable to refresh materialized weight trends for user ${userId}, and stale rows could not be invalidated. Trend visualizations may remain stale until recompute succeeds. Check weight_trend_recompute diagnostics and database health, then rerun trend recompute.`
            );
        }
    }
}
