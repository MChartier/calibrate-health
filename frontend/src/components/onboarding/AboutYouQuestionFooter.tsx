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
import { HEIGHT_UNITS, SEX_VALUES, type HeightUnit } from '../../context/authContext';
import { getActivityLevelOptions } from '../../constants/activityLevels';
import type { AboutQuestionKey } from './types';
import OnboardingQuestionHeader from './OnboardingQuestionHeader';
import { useI18n } from '../../i18n/useI18n';

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
 * Map an AboutQuestionKey to the short prompt shown in the fixed onboarding footer.
 */
function getPromptForAboutQuestion(key: AboutQuestionKey): string {
    switch (key) {
        case 'dob':
            return "What's your date of birth?";
        case 'sex':
            return 'Sex at birth (for BMR estimate)';
        case 'activityLevel':
            return 'How active are you in a typical week?';
        case 'height':
            return "What's your height?";
        default:
            return "What's next?";
    }
}

/**
 * AboutYouQuestionFooter renders the active "Calorie burn" onboarding question in the fixed footer area.
 *
 * This keeps the UI feeling conversational: users answer one question, explicitly confirm, and then
 * see their completed answers accumulate in the main content area.
 */
const AboutYouQuestionFooter: React.FC<AboutYouQuestionFooterProps> = (props) => {
    const { t } = useI18n();
    const activityLevelOptions = React.useMemo(() => getActivityLevelOptions(t), [t]);

    const prompt = getPromptForAboutQuestion(props.questionKey);

    const heightFieldsValid =
        props.heightUnit === HEIGHT_UNITS.CM ? Boolean(props.heightCm.trim()) : Boolean(props.heightFeet.trim());

    const handleEnterToSubmit: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        props.onSubmit?.();
    };

    // Pick the active input control (dob/sex/activity/height). Keeping this out of the JSX below
    // makes the footer layout easier to scan and reduces branching in the render tree.
    let activeQuestionControl: React.ReactNode = null;

    if (props.questionKey === 'dob') {
        activeQuestionControl = (
            <TextField
                label={t('profile.dateOfBirth')}
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
        );
    } else if (props.questionKey === 'sex') {
        activeQuestionControl = (
            <FormControl fullWidth required disabled={props.disabled} error={props.showErrors && !props.sex} size="small">
                <InputLabel>{t('profile.sex')}</InputLabel>
                <Select
                    value={props.sex}
                    label={t('profile.sex')}
                    onChange={(e) => props.onSexChange(e.target.value)}
                    size="small"
                    autoFocus
                >
                    <MenuItem value={SEX_VALUES.MALE}>{t('profile.sex.male')}</MenuItem>
                    <MenuItem value={SEX_VALUES.FEMALE}>{t('profile.sex.female')}</MenuItem>
                </Select>
                {props.showErrors && !props.sex && <FormHelperText>Required.</FormHelperText>}
            </FormControl>
        );
    } else if (props.questionKey === 'activityLevel') {
        activeQuestionControl = (
            <FormControl fullWidth required disabled={props.disabled} error={props.showErrors && !props.activityLevel} size="small">
                <InputLabel>{t('profile.activityLevel')}</InputLabel>
                <Select
                    value={props.activityLevel}
                    label={t('profile.activityLevel')}
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
        );
    } else if (props.questionKey === 'height') {
        const heightInput =
            props.heightUnit === HEIGHT_UNITS.CM ? (
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
            );

        activeQuestionControl = (
            <Box>
                {heightInput}

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
                        <ToggleButton value={HEIGHT_UNITS.CM} aria-label={t('units.cmAria')}>
                            cm
                        </ToggleButton>
                        <ToggleButton value={HEIGHT_UNITS.FT_IN} aria-label={t('units.ftInAria')}>
                            ft/in
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            </Box>
        );
    }

    return (
        <Stack spacing={1}>
            <OnboardingQuestionHeader
                prompt={prompt}
                progressLabel={props.progressLabel}
            />

            {activeQuestionControl}
        </Stack>
    );
};

export default AboutYouQuestionFooter;
