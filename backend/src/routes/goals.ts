import express from 'express';
import prisma from '../config/database';
import { parseDailyDeficit } from '../utils/goalDeficit';
import { gramsToWeight, parseWeightToGrams, type WeightUnit } from '../utils/units';
import { validateGoalWeightsForDailyDeficit } from '../utils/goalValidation';
import {
    ClientOperationConflictError,
    executeIdempotentMutation,
    parseClientOperationId,
    recordSyncChange
} from '../services/clientOperations';

/**
 * Goal endpoints for creating and fetching the current goal.
 *
 * We store weights in grams and always return the latest goal, converted to the user's unit preference.
 */
const router = express.Router();

/**
 * Ensure the session is authenticated before accessing goal data.
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);  

router.get('/', async (req, res) => {
    const user = req.user as any;
    const weightUnit = (user.weight_unit ?? 'KG') as WeightUnit;
    try {
        // Goals are append-only; the latest row is treated as the active goal.
        const goal = await prisma.goal.findFirst({
            where: { user_id: user.id },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }]
        });
        if (!goal) {
            return res.json(null);
        }

        const { start_weight_grams, target_weight_grams, ...rest } = goal;
        res.json({
            ...rest,
            start_weight: gramsToWeight(start_weight_grams, weightUnit),
            target_weight: gramsToWeight(target_weight_grams, weightUnit)
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const user = req.user as any;
    const { start_weight, target_weight, target_date, daily_deficit } = req.body;
    const weightUnit = (user.weight_unit ?? 'KG') as WeightUnit;
    try {
        const operationId = parseClientOperationId(
            req.get?.('x-client-operation-id') ?? req.headers?.['x-client-operation-id']
        );
        if (operationId === null) {
            return res.status(400).json({ message: 'Invalid x-client-operation-id' });
        }

        // Validate allowed deficit choices to keep projections and targets consistent with the UI.
        const parsedDailyDeficit = parseDailyDeficit(daily_deficit);
        if (parsedDailyDeficit === null) {
            return res.status(400).json({ message: 'daily_deficit must be one of 0, +/-250, +/-500, +/-750, or +/-1000' });
        }

        let start_weight_grams: number;
        let target_weight_grams: number;
        try {
            start_weight_grams = parseWeightToGrams(start_weight, weightUnit);
            target_weight_grams = parseWeightToGrams(target_weight, weightUnit);
        } catch {
            return res.status(400).json({ message: 'Invalid start weight or target weight' });
        }

        // Ensure the weight direction matches the deficit sign (loss vs gain vs maintain).
        const coherenceError = validateGoalWeightsForDailyDeficit({
            dailyDeficit: parsedDailyDeficit,
            startWeightGrams: start_weight_grams,
            targetWeightGrams: target_weight_grams
        });
        if (coherenceError) {
            return res.status(400).json({ message: coherenceError });
        }

        let parsedTargetDate: Date | null = null;
        if (target_date) {
            const candidate = new Date(target_date);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ message: 'Invalid target_date' });
            }
            parsedTargetDate = candidate;
        }

        const result = await executeIdempotentMutation<unknown>({
            userId: user.id,
            operationId,
            operationKind: 'goal.create',
            requestPayload: req.body,
            mutate: async (tx, claimedOperationId) => {
                const goal = await tx.goal.create({
                    data: {
                        user_id: user.id,
                        start_weight_grams,
                        target_weight_grams,
                        target_date: parsedTargetDate,
                        daily_deficit: parsedDailyDeficit
                    }
                });
                await recordSyncChange({
                    tx,
                    userId: user.id,
                    entityType: 'goal',
                    entityId: goal.id,
                    action: 'upsert',
                    operationId: claimedOperationId,
                    payload: goal
                });
                const {
                    start_weight_grams: createdStartWeightGrams,
                    target_weight_grams: createdTargetWeightGrams,
                    ...createdGoal
                } = goal;
                return {
                    status: 200,
                    body: {
                        ...createdGoal,
                        start_weight: gramsToWeight(createdStartWeightGrams, weightUnit),
                        target_weight: gramsToWeight(createdTargetWeightGrams, weightUnit)
                    }
                };
            }
        });
        return res.status(result.status).json(result.body);
    } catch (err) {
        if (err instanceof ClientOperationConflictError) {
            return res.status(409).json({
                message: err.message,
                code: err.code,
                retryable: err.code === 'OPERATION_IN_PROGRESS'
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
