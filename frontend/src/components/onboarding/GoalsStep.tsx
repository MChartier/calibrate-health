import React from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import { WEIGHT_UNITS, type WeightUnit } from '../../context/authContext';
import { normalizeDailyDeficitChoiceAbsValue } from '../../../../shared/goalDeficit';
import { ONBOARDING_CARD_CONTENT_SPACING, ONBOARDING_FIELD_SPACING } from './layout';
import type { GoalsQuestionKey } from './types';
import { formatWeeklyWeightChange, inferGoalModeFromWeights, parseFiniteNumber } from '../../utils/onboardingConversions';
import OnboardingSummaryRow from './OnboardingSummaryRow';
import { useI18n } from '../../i18n/useI18n';

/**
 * Onboarding "Goals" step summary display.
 */
export type GoalsStepProps = {
    weightUnit: WeightUnit;
    currentWeight: string;
    targetWeight: string;
    dailyDeficit: string;
    completedKeys: GoalsQuestionKey[];
    onEditQuestion: (key: GoalsQuestionKey) => void;
    prefersReducedMotion: boolean;
    highlightKey: GoalsQuestionKey | null;
};

/**
 * GoalsStep shows the "Goal" onboarding section content and a summary of confirmed answers.
 *
 * Inputs live in the fixed footer so the interaction feels guided and intentional: users answer
 * one question at a time, confirm, then see the result accumulate here.
 */
const GoalsStep: React.FC<GoalsStepProps> = (props) => {
    const { t } = useI18n();
    const weightUnitLabel = props.weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg';

    const currentWeightNumber = parseFiniteNumber(props.currentWeight);
    const targetWeightNumber = parseFiniteNumber(props.targetWeight);
    const inferredGoalMode = inferGoalModeFromWeights(currentWeightNumber, targetWeightNumber);

    const paceGoalMode = inferredGoalMode === 'lose' || inferredGoalMode === 'gain' ? inferredGoalMode : null;
    const dailyDeficitAbs = normalizeDailyDeficitChoiceAbsValue(props.dailyDeficit);
    const paceHint = paceGoalMode
        ? formatWeeklyWeightChange({
            goalMode: paceGoalMode,
            dailyCaloriesAbs: dailyDeficitAbs,
            weightUnit: props.weightUnit
        })
        : null;

    const paceValue =
        paceGoalMode && paceHint
            ? `${paceHint} (${paceGoalMode === 'gain' ? '+' : '-'}${props.dailyDeficit} kcal/day)`
            : '';

    const hasAnySummary = props.completedKeys.length > 0;

    return (
        <Stack spacing={ONBOARDING_CARD_CONTENT_SPACING}>
            <Box>
                <Typography variant="h5" gutterBottom>
                    {t('onboarding.goals.title')}
                </Typography>
                <Typography sx={{
                    color: "text.secondary"
                }}>
                    {t('onboarding.goals.body')}
                </Typography>
            </Box>
            {hasAnySummary ? (
                <Stack spacing={ONBOARDING_FIELD_SPACING}>
                    {props.completedKeys.includes('currentWeight') && props.currentWeight.trim() && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label={t('onboarding.goals.currentWeight')}
                                    value={`${props.currentWeight.trim()} ${weightUnitLabel}`}
                                    onEdit={() => props.onEditQuestion('currentWeight')}
                                    highlight={props.highlightKey === 'currentWeight'}
                                />
                            </Box>
                        </Collapse>
                    )}

                    {props.completedKeys.includes('targetWeight') && props.targetWeight.trim() && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label={t('onboarding.goals.targetWeight')}
                                    value={`${props.targetWeight.trim()} ${weightUnitLabel}`}
                                    onEdit={() => props.onEditQuestion('targetWeight')}
                                    highlight={props.highlightKey === 'targetWeight'}
                                />
                            </Box>
                        </Collapse>
                    )}

                    {paceGoalMode && props.completedKeys.includes('pace') && paceValue && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label={t('onboarding.goals.pace')}
                                    value={paceValue}
                                    onEdit={() => props.onEditQuestion('pace')}
                                    highlight={props.highlightKey === 'pace'}
                                />
                            </Box>
                        </Collapse>
                    )}
                </Stack>
            ) : (
                <Typography sx={{
                    color: "text.secondary"
                }}>
                    {t('onboarding.goals.emptyHint')}
                </Typography>
            )}
        </Stack>
    );
};

export default GoalsStep;
