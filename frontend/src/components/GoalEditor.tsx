import React, { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { validateGoalWeights, type GoalMode } from '../utils/goalValidation';
import { DAILY_DEFICIT_CHOICE_STRINGS, normalizeDailyDeficitChoiceAbsValue } from '../../../shared/goalDeficit';
import { getGoalModeFromDailyDeficit, roundWeight } from '../utils/goalTracking';

export type GoalEditorProps = {
    weightUnitLabel: string;
    initialStartWeight: number | null;
    initialTargetWeight: number | null;
    initialDailyDeficit: number | null;
    submitLabel: string;
    onSaved: () => void;
    onCancel?: () => void;
};

/**
 * GoalEditor
 *
 * Form for creating a goal (first-time or replacement). We always create a new goal
 * record so the start date resets and previous goals remain historically available.
 */
const GoalEditor: React.FC<GoalEditorProps> = ({
    weightUnitLabel,
    initialStartWeight,
    initialTargetWeight,
    initialDailyDeficit,
    submitLabel,
    onSaved,
    onCancel
}) => {
    const queryClient = useQueryClient();

    const [startWeightInput, setStartWeightInput] = useState<string | null>(null);
    const [targetWeightInput, setTargetWeightInput] = useState<string | null>(null);
    const [dailyDeficitInput, setDailyDeficitInput] = useState<string | null>(null);
    const initialGoalMode = useMemo<GoalMode>(() => {
        if (typeof initialDailyDeficit !== 'number' || !Number.isFinite(initialDailyDeficit)) return 'lose';
        return getGoalModeFromDailyDeficit(initialDailyDeficit);
    }, [initialDailyDeficit]);

    const normalizedInitialDailyDeficitAbs = useMemo(() => {
        if (initialGoalMode === 'maintain') return 0;
        return normalizeDailyDeficitChoiceAbsValue(initialDailyDeficit);
    }, [initialDailyDeficit, initialGoalMode]);

    const [goalMode, setGoalMode] = useState<GoalMode>(initialGoalMode);

    const [alert, setAlert] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const initialBaselineRef = useRef<{
        startWeight: number | null;
        targetWeight: number | null;
        goalMode: GoalMode;
        dailyDeficitAbs: number;
    }>({
        startWeight:
            typeof initialStartWeight === 'number' && Number.isFinite(initialStartWeight) ? roundWeight(initialStartWeight) : null,
        targetWeight:
            typeof initialTargetWeight === 'number' && Number.isFinite(initialTargetWeight) ? roundWeight(initialTargetWeight) : null,
        goalMode: initialGoalMode,
        dailyDeficitAbs: normalizedInitialDailyDeficitAbs
    });

    const startWeightValue = useMemo(() => {
        if (startWeightInput !== null) return startWeightInput;
        return typeof initialStartWeight === 'number' && Number.isFinite(initialStartWeight) ? initialStartWeight.toString() : '';
    }, [initialStartWeight, startWeightInput]);

    const targetWeightValue = useMemo(() => {
        if (targetWeightInput !== null) return targetWeightInput;
        return typeof initialTargetWeight === 'number' && Number.isFinite(initialTargetWeight) ? initialTargetWeight.toString() : '';
    }, [initialTargetWeight, targetWeightInput]);

    const dailyDeficitValue = useMemo(() => {
        if (dailyDeficitInput !== null) return dailyDeficitInput;
        return normalizeDailyDeficitChoiceAbsValue(initialDailyDeficit).toString();
    }, [dailyDeficitInput, initialDailyDeficit]);

    const hasChanges = useMemo(() => {
        const initial = initialBaselineRef.current;

        const parseMaybeWeight = (value: string): number | null => {
            const trimmed = value.trim();
            if (trimmed.length === 0) return null;
            const numeric = Number(trimmed);
            return Number.isFinite(numeric) ? roundWeight(numeric) : null;
        };

        const normalizedStart = parseMaybeWeight(startWeightValue);
        const normalizedTarget = parseMaybeWeight(targetWeightValue);

        const parsedDailyAbs = goalMode === 'maintain' ? 0 : Number.parseInt(dailyDeficitValue || '0', 10);
        const normalizedDailyAbs = Number.isFinite(parsedDailyAbs) ? parsedDailyAbs : null;

        if (initial.goalMode !== goalMode) return true;
        if (initial.startWeight !== normalizedStart) return true;
        if (initial.targetWeight !== normalizedTarget) return true;
        if (normalizedDailyAbs !== null && initial.dailyDeficitAbs !== normalizedDailyAbs) return true;
        if (normalizedDailyAbs === null && initial.dailyDeficitAbs !== 0) return true;
        return false;
    }, [dailyDeficitValue, goalMode, startWeightValue, targetWeightValue]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAlert(null);

        const startWeightNumber = Number(startWeightValue);
        const targetWeightNumber = Number(targetWeightValue);
        const validationError = validateGoalWeights({
            goalMode,
            startWeight: startWeightNumber,
            targetWeight: targetWeightNumber
        });
        if (validationError) {
            setAlert({ message: validationError, severity: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            const deficitValue = goalMode === 'maintain' ? 0 : parseInt(dailyDeficitValue || '0', 10);
            const signedDeficit = goalMode === 'gain' ? -Math.abs(deficitValue) : Math.abs(deficitValue);

            await axios.post('/api/goals', {
                start_weight: startWeightValue,
                target_weight: targetWeightValue,
                daily_deficit: signedDeficit
            });

            setAlert({ message: 'Goal saved', severity: 'success' });
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setDailyDeficitInput(null);

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['goal'] }),
                queryClient.invalidateQueries({ queryKey: ['profile'] }),
                queryClient.invalidateQueries({ queryKey: ['profile-summary'] })
            ]);

            onSaved();
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const serverMessage = (err.response?.data as { message?: unknown } | undefined)?.message;
                if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
                    setAlert({ message: serverMessage, severity: 'error' });
                } else {
                    setAlert({ message: 'Failed to save goal', severity: 'error' });
                }
            } else {
                setAlert({ message: 'Failed to save goal', severity: 'error' });
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Box component="form" onSubmit={(e) => void handleSubmit(e)}>
            <Stack spacing={2}>
                <TextField
                    label={`Start Weight (${weightUnitLabel})`}
                    type="number"
                    value={startWeightValue}
                    onChange={(e) => {
                        setStartWeightInput(e.target.value);
                        setAlert(null);
                    }}
                    inputProps={{ step: 0.1 }}
                    required
                    fullWidth
                />
                <TextField
                    label={`Target Weight (${weightUnitLabel})`}
                    type="number"
                    value={targetWeightValue}
                    onChange={(e) => {
                        setTargetWeightInput(e.target.value);
                        setAlert(null);
                    }}
                    inputProps={{ step: 0.1 }}
                    required
                    fullWidth
                />

                <FormControl fullWidth>
                    <InputLabel>Goal type</InputLabel>
                    <Select
                        value={goalMode}
                        label="Goal type"
                        onChange={(e) => {
                            setGoalMode(e.target.value as GoalMode);
                            setAlert(null);
                        }}
                    >
                        <MenuItem value="lose">Lose weight (calorie deficit)</MenuItem>
                        <MenuItem value="maintain">Maintain weight</MenuItem>
                        <MenuItem value="gain">Gain weight (calorie surplus)</MenuItem>
                    </Select>
                </FormControl>

                {goalMode !== 'maintain' && (
                    <FormControl fullWidth>
                        <InputLabel>Daily calorie change</InputLabel>
                        <Select
                            value={dailyDeficitValue}
                            label="Daily calorie change"
                            onChange={(e) => {
                                setDailyDeficitInput(e.target.value);
                                setAlert(null);
                            }}
                        >
                            {DAILY_DEFICIT_CHOICE_STRINGS.map((val) => (
                                <MenuItem key={val} value={val}>
                                    {goalMode === 'gain' ? '+' : '-'}
                                    {val} Calories/day
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {onCancel && (
                        <Button variant="text" onClick={onCancel} disabled={isSaving}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" variant="contained" disabled={isSaving || !hasChanges}>
                        {isSaving ? 'Saving…' : submitLabel}
                    </Button>
                </Box>
            </Stack>

            {alert && (
                <Alert severity={alert.severity} sx={{ mt: 2 }}>
                    {alert.message}
                </Alert>
            )}
        </Box>
    );
};

export default GoalEditor;

