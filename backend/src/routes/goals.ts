import express from 'express';
import { parseDailyDeficit } from '../utils/goalDeficit';
import { gramsToWeight, parseWeightToGrams, type WeightUnit } from '../utils/units';
import { validateGoalWeightsForDailyDeficit } from '../utils/goalValidation';
import {
    ClientOperationConflictError,
    executeIdempotentMutation,
    parseClientOperationId,
    recordSyncChange
} from '../services/clientOperations';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../middleware/authenticatedUser';
import { evaluateCaloriePlan, isPolicyWeight, projectGoalEndDate } from '../../../shared/caloriePolicy';
import { buildStoredCaloriePlanningSnapshot, getStoredCaloriePlanningSnapshot, projectionWire } from '../services/caloriePlanning';

/**
 * Goal endpoints for creating and fetching the current goal.
 *
 * We store weights in grams and always return the latest goal, converted to the user's unit preference.
 */
const router = express.Router();

router.use(requireAuthenticatedUser);

router.get('/', async (req, res) => {
    const user = getAuthenticatedUser(req);
    try {
        const snapshot = await getStoredCaloriePlanningSnapshot(user.id);
        if (!snapshot) return res.status(404).json({ message: 'User not found' });
        if (!snapshot.goal) return res.json(null);
        const goal = snapshot.goal;
        const { start_weight_grams: startWeightGrams, target_weight_grams: targetWeightGrams, ...goalFields } = goal;
        return res.json({
            ...goalFields,
            start_weight: gramsToWeight(startWeightGrams, snapshot.user.weight_unit),
            target_weight: gramsToWeight(targetWeightGrams, snapshot.user.weight_unit),
            plan_status: snapshot.evaluation.status,
            plan_reason_code: snapshot.evaluation.reasonCode,
            projection: projectionWire(snapshot.projection!)
        });
    } catch {
        return res.status(500).json({ message: 'Server error' });
    }
});
router.post('/', async (req, res) => {
    const user = getAuthenticatedUser(req);
    const { start_weight, target_weight, target_date, daily_deficit } = req.body;
    const weightUnit: WeightUnit = user.weight_unit ?? 'KG';
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
            return res.status(400).json({ message: 'That calorie plan option is unavailable.', code: 'CALORIE_PLAN_OPTION_UNAVAILABLE', retryable: false, field_errors: { daily_deficit: ['Choose an available calorie plan option.'] } });
        }

        let start_weight_grams: number;
        let target_weight_grams: number;
        try {
            start_weight_grams = parseWeightToGrams(start_weight, weightUnit);
            target_weight_grams = parseWeightToGrams(target_weight, weightUnit);
        } catch {
            return res.status(400).json({ message: 'Start and target weights are invalid.', code: 'WEIGHT_OUT_OF_RANGE', retryable: false, field_errors: { start_weight: ['Enter a weight within the supported range.'], target_weight: ['Enter a weight within the supported range.'] } });
        }
        if (!isPolicyWeight(start_weight_grams) || !isPolicyWeight(target_weight_grams)) {
            return res.status(400).json({ message: 'Start and target weights must be within the supported range.', code: 'WEIGHT_OUT_OF_RANGE', retryable: false, field_errors: { start_weight: ['Enter a weight within the supported range.'], target_weight: ['Enter a weight within the supported range.'] } });
        }

        // Ensure the weight direction matches the deficit sign (loss vs gain vs maintain).
        const coherenceError = validateGoalWeightsForDailyDeficit({
            dailyDeficit: parsedDailyDeficit,
            startWeightGrams: start_weight_grams,
            targetWeightGrams: target_weight_grams
        });
        if (coherenceError) {
            return res.status(400).json({ message: coherenceError, code: 'CALORIE_PLAN_OPTION_UNAVAILABLE', retryable: false, field_errors: { target_weight: [coherenceError] } });
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
                const snapshot = await buildStoredCaloriePlanningSnapshot(tx, user.id);
                if (!snapshot) return { status: 404, body: { message: 'User not found' } };
                const evaluation = evaluateCaloriePlan({
                    profile: {
                        timezone: snapshot.user.timezone,
                        dateOfBirth: snapshot.user.date_of_birth,
                        sex: snapshot.user.sex,
                        heightMm: snapshot.user.height_mm,
                        activityLevel: snapshot.user.activity_level
                    },
                    latestWeightGrams: snapshot.latestWeightGrams,
                    goal: {
                        startWeightGrams: start_weight_grams,
                        targetWeightGrams: target_weight_grams,
                        dailyDeficit: parsedDailyDeficit,
                        reviewStatus: 'CLEAR'
                    }
                });
                if (evaluation.eligibility.status !== 'eligible') {
                    return {
                        status: 400,
                        body: {
                            message: 'Adult eligibility is required for calorie planning.',
                            code: 'ADULT_ELIGIBILITY_REQUIRED',
                            retryable: false,
                            field_errors: { date_of_birth: ['Confirm an eligible adult date of birth before creating a goal.'] }
                        }
                    };
                }
                if (evaluation.status !== 'available') {
                    return {
                        status: 400,
                        body: {
                            message: 'That calorie plan option is unavailable.',
                            code: 'CALORIE_PLAN_OPTION_UNAVAILABLE',
                            retryable: false,
                            field_errors: { daily_deficit: ['Choose an available calorie plan option.'] }
                        }
                    };
                }
                const goal = await tx.goal.create({
                    data: {
                        user_id: user.id,
                        start_weight_grams,
                        target_weight_grams,
                        target_date: parsedTargetDate,
                        daily_deficit: parsedDailyDeficit,
                        calorie_plan_review_status: 'CLEAR',
                        calorie_plan_review_reason: null
                    }
                });
                await recordSyncChange({
                    tx, userId: user.id, entityType: 'goal', entityId: goal.id, action: 'upsert',
                    operationId: claimedOperationId, payload: goal
                });
                const projection = projectGoalEndDate({
                    planStatus: evaluation.status,
                    planReasonCode: evaluation.reasonCode,
                    localDate: snapshot.localToday,
                    currentWeightGrams: snapshot.latestWeightGrams,
                    targetWeightGrams: goal.target_weight_grams,
                    dailyDeficit: goal.daily_deficit,
                    weightUnit: snapshot.user.weight_unit
                });
                const { start_weight_grams: createdStartWeightGrams, target_weight_grams: createdTargetWeightGrams, ...createdGoal } = goal;
                return {
                    status: 200,
                    body: {
                        ...createdGoal,
                        start_weight: gramsToWeight(createdStartWeightGrams, weightUnit),
                        target_weight: gramsToWeight(createdTargetWeightGrams, weightUnit),
                        plan_status: evaluation.status,
                        plan_reason_code: evaluation.reasonCode,
                        projection: projectionWire(projection)
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
