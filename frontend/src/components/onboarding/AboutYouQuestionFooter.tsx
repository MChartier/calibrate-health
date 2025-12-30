import React from 'react';
import {
    Box,
    FormControl,
    FormHelperText,
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
import type { HeightUnit } from '../../context/authContext';
import { activityLevelOptions } from '../../constants/activityLevels';
import type { AboutQuestionKey } from './types';
import OnboardingQuestionHeader from './OnboardingQuestionHeader';

export type AboutYouQuestionFooterProps = {
    questionKey: AboutQuestionKey;
    progressLabel: string;
    heightUnit: HeightUnit;
    onSetHeightUnit: (unit: HeightUnit) => void;
    dob: string;
    onDobChange: (value: string) => void;
    sex: string;
    onSexChange: (value: string) => void;
    activityLevel: string;
    onActivityLevelChange: (value: string) => void;
    heightCm: string;
    onHeightCmChange: (value: string) => void;
    heightFeet: string;
    onHeightFeetChange: (value: string) => void;
    heightInches: string;
    onHeightInchesChange: (value: string) => void;
    showErrors: boolean;
    disabled: boolean;
    onSubmit?: () => void;
};

/**
 * AboutYouQuestionFooter renders the active "Calorie burn" onboarding question in the fixed footer area.
 *
 * This keeps the UI feeling conversational: users answer one question, explicitly confirm, and then
 * see their completed answers accumulate in the main content area.
 */
const AboutYouQuestionFooter: React.FC<AboutYouQuestionFooterProps> = (props) => {
    const prompt =
        props.questionKey === 'dob'
            ? "What's your date of birth?"
            : props.questionKey === 'sex'
                ? 'Sex at birth (for BMR estimate)'
            : props.questionKey === 'activityLevel'
                ? 'How active are you in a typical week?'
                : "What's your height?";

    const heightFieldsValid = props.heightUnit === 'CM' ? Boolean(props.heightCm) : Boolean(props.heightFeet);

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

            {props.questionKey === 'dob' && (
                <TextField
                    label="Date of birth"
                    type="date"
                    value={props.dob}
                    onChange={(e) => props.onDobChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                    disabled={props.disabled}
                    size="small"
                    fullWidth
                    autoFocus
                    error={props.showErrors && !props.dob}
                    helperText={props.showErrors && !props.dob ? 'Required.' : undefined}
                    onKeyDown={handleEnterToSubmit}
                />
            )}

            {props.questionKey === 'sex' && (
                <FormControl fullWidth required disabled={props.disabled} error={props.showErrors && !props.sex} size="small">
                    <InputLabel>Sex</InputLabel>
                    <Select
                        value={props.sex}
                        label="Sex"
                        onChange={(e) => props.onSexChange(e.target.value)}
                        size="small"
                        autoFocus
                    >
                        <MenuItem value="MALE">Male</MenuItem>
                        <MenuItem value="FEMALE">Female</MenuItem>
                    </Select>
                    {props.showErrors && !props.sex && <FormHelperText>Required.</FormHelperText>}
                </FormControl>
            )}

            {props.questionKey === 'activityLevel' && (
                <FormControl
                    fullWidth
                    required
                    disabled={props.disabled}
                    error={props.showErrors && !props.activityLevel}
                    size="small"
                >
                    <InputLabel>Activity level</InputLabel>
                    <Select
                        value={props.activityLevel}
                        label="Activity level"
                        onChange={(e) => props.onActivityLevelChange(e.target.value)}
                        size="small"
                        autoFocus
                        renderValue={(selected) => {
                            const value = typeof selected === 'string' ? selected : '';
                            return activityLevelOptions.find((option) => option.value === value)?.title ?? '';
                        }}
                    >
                        {activityLevelOptions.map((option) => (
                            <MenuItem
                                key={option.value}
                                value={option.value}
                                sx={{
                                    alignItems: 'flex-start',
                                    whiteSpace: 'normal',
                                    py: 1
                                }}
                            >
                                <Box>
                                    <Typography variant="body2" fontWeight={800}>
                                        {option.title}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {option.description}
                                    </Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                    {props.showErrors && !props.activityLevel && <FormHelperText>Required.</FormHelperText>}
                </FormControl>
            )}

            {props.questionKey === 'height' && (
                <Box>
                    {props.heightUnit === 'CM' ? (
                        <TextField
                            label="Height"
                            type="number"
                            value={props.heightCm}
                            onChange={(e) => props.onHeightCmChange(e.target.value)}
                            inputProps={{ min: 50, max: 272, step: 0.1, inputMode: 'decimal' }}
                            InputProps={{
                                endAdornment: <InputAdornment position="end">cm</InputAdornment>
                            }}
                            required
                            disabled={props.disabled}
                            size="small"
                            fullWidth
                            autoFocus
                            error={props.showErrors && !heightFieldsValid}
                            helperText={props.showErrors && !heightFieldsValid ? 'Please enter your height.' : ' '}
                            onKeyDown={handleEnterToSubmit}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Feet"
                                type="number"
                                value={props.heightFeet}
                                onChange={(e) => props.onHeightFeetChange(e.target.value)}
                                inputProps={{ min: 1, max: 8, step: 1, inputMode: 'numeric' }}
                                required
                                disabled={props.disabled}
                                size="small"
                                fullWidth
                                autoFocus
                                sx={{ flex: 1 }}
                                error={props.showErrors && !heightFieldsValid}
                                helperText={props.showErrors && !heightFieldsValid ? 'Enter feet.' : ' '}
                                onKeyDown={handleEnterToSubmit}
                            />
                            <TextField
                                label="Inches"
                                type="number"
                                value={props.heightInches}
                                onChange={(e) => props.onHeightInchesChange(e.target.value)}
                                inputProps={{ min: 0, max: 11.9, step: 0.1, inputMode: 'decimal' }}
                                disabled={props.disabled}
                                size="small"
                                fullWidth
                                sx={{ flex: 1 }}
                                onKeyDown={handleEnterToSubmit}
                            />
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={props.heightUnit}
                            onChange={(_event, value) => {
                                if (value === null) return;
                                props.onSetHeightUnit(value as HeightUnit);
                            }}
                            aria-label="Height unit"
                            disabled={props.disabled}
                        >
                            <ToggleButton value="CM" aria-label="Centimeters">
                                cm
                            </ToggleButton>
                            <ToggleButton value="FT_IN" aria-label="Feet and inches">
                                ft/in
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>
            )}
        </Stack>
    );
};

export default AboutYouQuestionFooter;
