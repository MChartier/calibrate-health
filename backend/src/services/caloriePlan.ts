import prisma from '../config/database';

type CaloriePlanDatabase = Pick<typeof prisma, 'caloriePlanRevision'>;

export type EffectiveCaloriePlan = {
    id: number;
    targetAdjustmentKcal: number;
    effectiveLocalDate: Date;
};

/** Resolve the most recent accepted adjustment effective for a user-local date. */
export async function getEffectiveCaloriePlan(
    userId: number,
    localDate: Date,
    database: CaloriePlanDatabase = prisma
): Promise<EffectiveCaloriePlan | null> {
    const revision = await database.caloriePlanRevision.findFirst({
        where: {
            user_id: userId,
            effective_local_date: { lte: localDate }
        },
        orderBy: [{ effective_local_date: 'desc' }, { id: 'desc' }],
        select: { id: true, target_adjustment_kcal: true, effective_local_date: true }
    });
    if (!revision) return null;
    return {
        id: revision.id,
        targetAdjustmentKcal: revision.target_adjustment_kcal,
        effectiveLocalDate: revision.effective_local_date
    };
}
