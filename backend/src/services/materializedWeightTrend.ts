import prisma from '../config/database';
import { computeWeightTrend } from './weightTrend';

const GRAMS_PER_KILOGRAM = 1000; // Canonical storage-to-model conversion for trend persistence.
export const WEIGHT_TREND_MODEL_VERSION = 1;

type TrendPersistenceClient = Pick<typeof prisma, 'bodyMetric' | 'bodyMetricTrend'>;

/**
 * Recompute and replace one user's materialized weight trend rows from current BodyMetric history.
 */
export async function recomputeAndStoreUserWeightTrends(
    userId: number,
    client: TrendPersistenceClient = prisma
): Promise<void> {
    const metricsAsc = await client.bodyMetric.findMany({
        where: { user_id: userId },
        orderBy: { date: 'asc' },
        select: { id: true, user_id: true, date: true, weight_grams: true }
    });

    const trendResult = computeWeightTrend(
        metricsAsc.map((metric) => ({
            date: metric.date,
            weight: metric.weight_grams / GRAMS_PER_KILOGRAM
        }))
    );

    await client.bodyMetricTrend.deleteMany({
        where: { user_id: userId }
    });

    if (metricsAsc.length === 0) return;

    const trendByDateMs = new Map<number, (typeof trendResult.points)[number]>();
    for (const point of trendResult.points) {
        trendByDateMs.set(point.date.getTime(), point);
    }

    const rows = metricsAsc.flatMap((metric) => {
        const point = trendByDateMs.get(metric.date.getTime());
        if (!point) return [];
        return [
            {
                metric_id: metric.id,
                user_id: metric.user_id,
                date: metric.date,
                trend_weight_kg: point.trendWeight,
                trend_ci_lower_kg: point.lower95,
                trend_ci_upper_kg: point.upper95,
                trend_std_kg: point.trendStd,
                model_version: WEIGHT_TREND_MODEL_VERSION
            }
        ];
    });

    if (rows.length === 0) return;

    await client.bodyMetricTrend.createMany({ data: rows });
}

/**
 * Ensure trend rows exist for all metrics and match the active model version.
 */
export async function ensureMaterializedWeightTrends(userId: number): Promise<void> {
    const staleOrMissing = await prisma.bodyMetric.findFirst({
        where: {
            user_id: userId,
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
