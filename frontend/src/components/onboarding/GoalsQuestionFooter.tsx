import React from 'react';
import {
    Box,
    FormControl,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { WEIGHT_UNITS, type WeightUnit } from '../../context/authContext';
import { DAILY_DEFICIT_CHOICE_STRINGS, normalizeDailyDeficitChoiceAbsValue } from '../../../../shared/goalDeficit';
import type { GoalsQuestionKey } from './types';
import { formatWeeklyWeightChange, inferGoalModeFromWeights, parseFiniteNumber } from '../../utils/onboardingConversions';
import OnboardingQuestionHeader from './OnboardingQuestionHeader';

export type GoalsQuestionFooterProps = {
    questionKey: GoalsQuestionKey;
    progressLabel: string;
    weightUnit: WeightUnit;
    onSetWeightUnit: (unit: WeightUnit) => void;
    currentWeight: string;
    onCurrentWeightChange: (value: string) => void;
    targetWeight: string;
    onTargetWeightChange: (value: string) => void;
    dailyDeficit: string;
    onDailyDeficitChange: (value: string) => void;
    showErrors: boolean;
    disabled: boolean;
    onSubmit?: () => void;
};

/**
 * Build the conversational prompt shown above the active "Goal" question input.
 */
function getPromptForGoalsQuestion(opts: {
    questionKey: GoalsQuestionKey;
    inferredGoalMode: ReturnType<typeof inferGoalModeFromWeights>;
}): string {
    switch (opts.questionKey) {
        case 'currentWeight':
            return "What's your current weight right now?";
        case 'targetWeight':
            return 'What is your target weight?';
        case 'pace':
            if (opts.inferredGoalMode === 'gain') return 'How fast do you want to gain weight?';
            return 'How fast do you want to lose weight?';
        default:
            return "What's next?";
    }
}

/**
 * GoalsQuestionFooter renders the active "Goal" onboarding question in the fixed footer area.
 *
 * The parent controls which question is active and advances only on explicit confirmation,
 * avoiding jarring "next field appears while typing" behavior.
 */
const GoalsQuestionFooter: React.FC<GoalsQuestionFooterProps> = (props) => {
    const weightUnitLabel = props.weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg';

    const currentWeightNumber = parseFiniteNumber(props.currentWeight);
    const hasCurrentWeight = currentWeightNumber !== null && currentWeightNumber > 0;
    const currentWeightIsBlank = props.currentWeight.trim().length === 0;
    const currentWeightIsInvalid = !currentWeightIsBlank && !hasCurrentWeight;
    let currentWeightErrorText: string | undefined;
    if (currentWeightIsBlank) {
        currentWeightErrorText = props.showErrors ? 'Required.' : undefined;
    } else if (currentWeightIsInvalid) {
        currentWeightErrorText = 'Must be a positive number.';
    }

    const targetWeightNumber = parseFiniteNumber(props.targetWeight);
    const hasTargetWeight = targetWeightNumber !== null && targetWeightNumber > 0;
    const targetWeightIsBlank = props.targetWeight.trim().length === 0;
    const targetWeightIsInvalid = !targetWeightIsBlank && !hasTargetWeight;
    let targetWeightErrorText: string | undefined;
    if (targetWeightIsBlank) {
        targetWeightErrorText = props.showErrors ? 'Required.' : undefined;
    } else if (targetWeightIsInvalid) {
        targetWeightErrorText = 'Must be a positive number.';
    }

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
    const paceCaloriesLabel = paceGoalMode ? `${paceGoalMode === 'gain' ? '+' : '-'}${props.dailyDeficit} kcal/day` : null;

    const prompt = getPromptForGoalsQuestion({ questionKey: props.questionKey, inferredGoalMode });

    const handleEnterToSubmit: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        props.onSubmit?.();
    };

    return (
        <Stack spacing={1}>
            <OnboardingQuestionHeader
                prompt={prompt}
                progressLabel={props.progressLabel}
            />

            {props.questionKey === 'currentWeight' && (
                <Box>
                    <TextField
                        label="Current weight"
                        type="number"
                        value={props.currentWeight}
                        onChange={(e) => props.onCurrentWeightChange(e.target.value)}
                        inputProps={{ min: 1, step: 0.1, inputMode: 'decimal' }}
                        InputProps={{
                            endAdornment: <InputAdornment position="end">{weightUnitLabel}</InputAdornment>
                        }}
                        required
                        disabled={props.disabled}
                        size="small"
                        fullWidth
                        autoFocus
                        error={Boolean(currentWeightErrorText)}
                        helperText={currentWeightErrorText ?? ' '}
                        onKeyDown={handleEnterToSubmit}
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={props.weightUnit}
                            onChange={(_event, value) => {
                                if (value === null) return;
                                props.onSetWeightUnit(value as WeightUnit);
                            }}
                            aria-label="Weight unit"
                            disabled={props.disabled}
                        >
                            <ToggleButton value={WEIGHT_UNITS.LB} aria-label="Pounds">
                                lb
                            </ToggleButton>
                            <ToggleButton value={WEIGHT_UNITS.KG} aria-label="Kilograms">
                                kg
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>
            )}

            {props.questionKey === 'targetWeight' && (
                <Box>
                    <TextField
                        label="Target weight"
                        type="number"
                        value={props.targetWeight}
                        onChange={(e) => props.onTargetWeightChange(e.target.value)}
                        inputProps={{ min: 1, step: 0.1, inputMode: 'decimal' }}
                        InputProps={{
                            endAdornment: <InputAdornment position="end">{weightUnitLabel}</InputAdornment>
                        }}
                        required
                        disabled={props.disabled}
                        size="small"
                        fullWidth
                        autoFocus
                        error={Boolean(targetWeightErrorText)}
                        helperText={targetWeightErrorText ?? ' '}
                        onKeyDown={handleEnterToSubmit}
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={props.weightUnit}
                            onChange={(_event, value) => {
                                if (value === null) return;
                                props.onSetWeightUnit(value as WeightUnit);
                            }}
                            aria-label="Weight unit"
                            disabled={props.disabled}
                        >
                            <ToggleButton value={WEIGHT_UNITS.LB} aria-label="Pounds">
                                lb
                            </ToggleButton>
                            <ToggleButton value={WEIGHT_UNITS.KG} aria-label="Kilograms">
                                kg
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>
            )}

            {props.questionKey === 'pace' && paceGoalMode && (
                <FormControl fullWidth disabled={props.disabled} size="small">
                    <InputLabel>Pace</InputLabel>
                    <Select
                        value={props.dailyDeficit}
                        label="Pace"
                        onChange={(e) => props.onDailyDeficitChange(e.target.value)}
                        size="small"
                        autoFocus
                        renderValue={(selected) => {
                            const value = typeof selected === 'string' ? selected : '';
                            const absValue = normalizeDailyDeficitChoiceAbsValue(value);
                            return formatWeeklyWeightChange({
                                goalMode: paceGoalMode,
                                dailyCaloriesAbs: absValue,
                                weightUnit: props.weightUnit
                            });
                        }}
                    >
                        {DAILY_DEFICIT_CHOICE_STRINGS.map((val) => {
                            const absValue = normalizeDailyDeficitChoiceAbsValue(val);
                            const hint = formatWeeklyWeightChange({
                                goalMode: paceGoalMode,
                                dailyCaloriesAbs: absValue,
                                weightUnit: props.weightUnit
                            });
                            const sign = paceGoalMode === 'gain' ? '+' : '-';

                            return (
                                <MenuItem
                                    key={val}
                                    value={val}
                                    sx={{
                                        alignItems: 'flex-start',
                                        whiteSpace: 'normal',
                                        py: 1
                                    }}
                                >
                                    <Box>
                                        <Typography variant="body2" fontWeight={800}>
                                            {hint}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {sign}
                                            {val} kcal/day
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            );
                        })}
                    </Select>
                    {paceCaloriesLabel && paceHint && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            {paceCaloriesLabel} ({paceHint}). You can adjust this later.
                        </Typography>
                    )}
                </FormControl>
            )}
        </Stack>
    );
};

export default GoalsQuestionFooter;
