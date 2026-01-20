import React from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import { HEIGHT_UNITS, SEX_VALUES, type HeightUnit } from '../../context/authContext';
import { getActivityLevelOptions } from '../../constants/activityLevels';
import { ONBOARDING_CARD_CONTENT_SPACING, ONBOARDING_FIELD_SPACING } from './layout';
import type { AboutQuestionKey } from './types';
import OnboardingSummaryRow from './OnboardingSummaryRow';
import { useI18n } from '../../i18n/useI18n';

/**
 * Onboarding "About you" step summary display.
 */
/**
 * Format a YYYY-MM-DD date string into a friendly, locale-aware label without timezone shifting.
 */
function formatDobForSummary(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const parts = trimmed.split('-');
    if (parts.length !== 3) return trimmed;

    const [year, month, day] = parts.map((part) => Number(part));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return trimmed;

    // Construct in local time so we don't show "the previous day" in negative timezones.
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

/**
 * Format a height input (cm or ft/in) into a concise, readable summary label.
 */
function formatHeightForSummary(opts: {
    heightUnit: HeightUnit;
    heightCm: string;
    heightFeet: string;
    heightInches: string;
}): string {
    if (opts.heightUnit === HEIGHT_UNITS.CM) {
        const cm = opts.heightCm.trim();
        return cm ? `${cm} cm` : '';
    }

    const feet = opts.heightFeet.trim();
    if (!feet) return '';

    const inches = opts.heightInches.trim();
    return inches ? `${feet} ft ${inches} in` : `${feet} ft`;
}

/**
 * Format the sex-at-birth value stored in the profile into a UI label.
 */
function formatSexForSummary(value: string): string {
    if (value === SEX_VALUES.MALE) return 'Male';
    if (value === SEX_VALUES.FEMALE) return 'Female';
    return '';
}

export type AboutYouStepProps = {
    heightUnit: HeightUnit;
    dob: string;
    sex: string;
    activityLevel: string;
    heightCm: string;
    heightFeet: string;
    heightInches: string;
    completedKeys: AboutQuestionKey[];
    onEditQuestion: (key: AboutQuestionKey) => void;
    prefersReducedMotion: boolean;
    highlightKey: AboutQuestionKey | null;
};

/**
 * AboutYouStep shows the "Calorie burn" onboarding section content and a summary of confirmed answers.
 *
 * Inputs live in the fixed footer so users can answer one question at a time and stay focused.
 */
const AboutYouStep: React.FC<AboutYouStepProps> = (props) => {
    const { t } = useI18n();

    const heightValue = formatHeightForSummary({
        heightUnit: props.heightUnit,
        heightCm: props.heightCm,
        heightFeet: props.heightFeet,
        heightInches: props.heightInches
    });

    const activityLevelOptions = React.useMemo(() => getActivityLevelOptions(t), [t]);
    const activityTitle = activityLevelOptions.find((option) => option.value === props.activityLevel)?.title ?? '';

    let sexLabel = formatSexForSummary(props.sex);
    if (props.sex === SEX_VALUES.MALE) {
        sexLabel = t('profile.sex.male');
    } else if (props.sex === SEX_VALUES.FEMALE) {
        sexLabel = t('profile.sex.female');
    }

    const hasAnySummary = props.completedKeys.length > 0;
    const formattedDob = props.dob.trim() ? formatDobForSummary(props.dob) : '';

    return (
        <Stack spacing={ONBOARDING_CARD_CONTENT_SPACING}>
            <Box>
                <Typography variant="h5" gutterBottom>
                    Estimate your calorie burn
                </Typography>
                <Typography color="text.secondary">
                    We can estimate your TDEE (calories burned on a typical day) from a few quick details so your calorie target is realistic.
                </Typography>
            </Box>

            {hasAnySummary ? (
                <Stack spacing={ONBOARDING_FIELD_SPACING}>
                    {props.completedKeys.includes('dob') && props.dob.trim() && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label="Date of birth"
                                    value={formattedDob || props.dob.trim()}
                                    onEdit={() => props.onEditQuestion('dob')}
                                    highlight={props.highlightKey === 'dob'}
                                />
                            </Box>
                        </Collapse>
                    )}

                    {props.completedKeys.includes('sex') && sexLabel && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label="Sex at birth"
                                    value={sexLabel}
                                    onEdit={() => props.onEditQuestion('sex')}
                                    highlight={props.highlightKey === 'sex'}
                                />
                            </Box>
                        </Collapse>
                    )}

                    {props.completedKeys.includes('activityLevel') && activityTitle && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label="Activity"
                                    value={activityTitle}
                                    onEdit={() => props.onEditQuestion('activityLevel')}
                                    highlight={props.highlightKey === 'activityLevel'}
                                />
                            </Box>
                        </Collapse>
                    )}

                    {props.completedKeys.includes('height') && heightValue && (
                        <Collapse in appear timeout={props.prefersReducedMotion ? 0 : 180}>
                            <Box>
                                <OnboardingSummaryRow
                                    label="Height"
                                    value={heightValue}
                                    onEdit={() => props.onEditQuestion('height')}
                                    highlight={props.highlightKey === 'height'}
                                />
                            </Box>
                        </Collapse>
                    )}
                </Stack>
            ) : (
                <Typography color="text.secondary">
                    These details help us estimate your calorie burn. You can update them later in your profile.
                </Typography>
            )}
        </Stack>
    );
};

export default AboutYouStep;
