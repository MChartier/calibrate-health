import prisma from '../config/database';
import { addUtcDays } from '../utils/date';
import { computeWeightTrend } from './weightTrend';

const GRAMS_PER_KILOGRAM = 1000; // Canonical storage-to-model conversion for trend persistence.
export const MATERIALIZED_TREND_ACTIVE_HORIZON_DAYS = 120; // Keep trend modeling focused on recent weight behavior.
export const MATERIALIZED_TREND_WARMUP_DAYS = 30; // Extra context stabilizes the first active-window trend points.
export const WEIGHT_TREND_MODEL_VERSION = 1;

type TrendPersistenceClient = Pick<typeof prisma, 'bodyMetric' | 'bodyMetricTrend'>;
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
    client: TrendPersistenceClient
): Promise<MetricHistoryRow[]> {
    return client.bodyMetric.findMany({
        where: {
            user_id: userId,
            date: { gte: modelStartDate }
        },
        orderBy: { date: 'asc' },
        select: { id: true, user_id: true, date: true, weight_grams: true }
    });
}

/**
 * Fetch the newest metric date so recompute can anchor the active horizon.
 */
async function findLatestMetricDate(userId: number, client: TrendPersistenceClient): Promise<Date | null> {
    const latestMetric = await client.bodyMetric.findFirst({
        where: { user_id: userId },
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
    model_version: number;
}> {
    const trendResult = computeWeightTrend(
        metricsForModelWindow.map((metric) => ({
            date: metric.date,
            weight: metric.weight_grams / GRAMS_PER_KILOGRAM
        }))
    );

    const trendByDateMs = new Map<number, (typeof trendResult.points)[number]>();
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
    client: TrendPersistenceClient = prisma
): Promise<void> {
    const latestMetricDate = await findLatestMetricDate(userId, client);
    if (!latestMetricDate) {
        await client.bodyMetricTrend.deleteMany({
            where: { user_id: userId }
        });
        return;
    }

    const { activeStartDate, modelStartDate } = getMaterializedTrendWindowFromLatestDate(latestMetricDate);
    const metricsForModelWindow = await loadMetricsForModelWindow(userId, modelStartDate, client);
    const rows = buildActiveTrendRows(metricsForModelWindow, activeStartDate);

    await client.bodyMetricTrend.deleteMany({
        where: {
            user_id: userId,
            date: { gte: activeStartDate }
        }
    });

    if (rows.length > 0) {
        await client.bodyMetricTrend.createMany({ data: rows });
    }
}

/**
 * Ensure active-horizon trend rows exist and match the active model version.
 */
export async function ensureMaterializedWeightTrends(userId: number): Promise<void> {
    const latestMetric = await prisma.bodyMetric.findFirst({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        select: { date: true }
    });
    if (!latestMetric) return;

    const { activeStartDate } = getMaterializedTrendWindowFromLatestDate(latestMetric.date);
    const staleOrMissing = await prisma.bodyMetric.findFirst({
        where: {
            user_id: userId,
            date: { gte: activeStartDate },
            OR: [{ trend: { is: null } }, { trend: { is: { model_version: { not: WEIGHT_TREND_MODEL_VERSION } } } }]
        },
        select: { id: true }
    });

    if (!staleOrMissing) return;
    await recomputeAndStoreUserWeightTrends(userId);
}

/**
 * Refresh trend rows after metric writes without blocking user data writes on transient failures.
 */
export async function refreshMaterializedWeightTrendsBestEffort(userId: number): Promise<void> {
    try {
        await recomputeAndStoreUserWeightTrends(userId);
    } catch (error) {
        const recomputeDetail = error instanceof Error ? error.message : String(error);
        try {
            // Remove stale rows so read-time ensure can deterministically recompute on next trend fetch.
            await prisma.bodyMetricTrend.deleteMany({
                where: { user_id: userId }
            });
            console.warn(
                `Unable to refresh materialized weight trends for user ${userId}; existing trend rows were invalidated and will be recomputed on next trend read. Check backend logs and rerun trend recompute if this persists. Detail: ${recomputeDetail}`
            );
        } catch (invalidateError) {
            const invalidateDetail = invalidateError instanceof Error ? invalidateError.message : String(invalidateError);
            console.warn(
                `Unable to refresh materialized weight trends for user ${userId}, and stale rows could not be invalidated. Trend visualizations may remain stale until recompute succeeds. Check backend logs and rerun trend recompute. Recompute detail: ${recomputeDetail}. Invalidation detail: ${invalidateDetail}`
            );
        }
    }
}
