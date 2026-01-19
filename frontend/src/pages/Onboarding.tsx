import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Snackbar,
    Fade,
    Divider,
    Stack,
    Typography
} from '@mui/material';
import { useTheme, type Theme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from '../context/authContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useUserProfileQuery } from '../queries/userProfile';
import type { GoalMode } from '../utils/goalValidation';
import { formatDateToLocalDateString } from '../utils/date';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import AboutYouStep from '../components/onboarding/AboutYouStep';
import GoalsStep from '../components/onboarding/GoalsStep';
import ImportStep from '../components/onboarding/ImportStep';
import AboutYouQuestionFooter from '../components/onboarding/AboutYouQuestionFooter';
import GoalsQuestionFooter from '../components/onboarding/GoalsQuestionFooter';
import OnboardingStepDots from '../components/onboarding/OnboardingStepDots';
import OnboardingPlanSummary from '../components/onboarding/OnboardingPlanSummary';
import { ONBOARDING_CARD_CONTENT_SPACING, ONBOARDING_FOOTER_SPACING } from '../components/onboarding/layout';
import type { AboutQuestionKey, GoalsQuestionKey, OnboardingStep } from '../components/onboarding/types';
import LoseItImportDialog, { type LoseItImportSummary } from '../components/imports/LoseItImportDialog';
import { getDefaultUnitPreferencesForLocale } from '../utils/unitPreferences';
import {
    DEFAULT_DAILY_DEFICIT_CHOICE_STRING,
    normalizeDailyDeficitChoiceAbsValue
} from '../../../shared/goalDeficit';
import {
    convertHeightCmStringToFeetInches,
    convertHeightFeetInchesStringsToCm,
    convertWeightInputString,
    inferGoalModeFromWeights,
    parseFiniteNumber
} from '../utils/onboardingConversions';

/**
 * Onboarding wizard page that collects goal + profile details and computes a plan summary.
 *
 * The flow is split into guided steps with a fixed footer for question-by-question inputs.
 */
type OnboardingStage = 'intro' | 'wizard' | 'summary';

/**
 * Compute a responsive min-height for the onboarding card so it fills the viewport below the app bar.
 *
 * We subtract the app bar height and the outer AppPage vertical paddings, so the card can be
 * full-height without relying on hard-coded pixel values.
 */
function getOnboardingCardMinHeight(theme: Theme): { xs: string; sm: string; md: string } {
    const toolbarMixin = theme.mixins.toolbar as unknown as {
        minHeight?: number;
        [key: string]: { minHeight?: number } | number | undefined;
    };
    const toolbarXs = typeof toolbarMixin.minHeight === 'number' ? toolbarMixin.minHeight : 0;
    const smKey = theme.breakpoints.up('sm');
    const toolbarSmCandidate = (toolbarMixin as { [key: string]: unknown })[smKey] as { minHeight?: unknown } | undefined;
    const toolbarSm = typeof toolbarSmCandidate?.minHeight === 'number' ? toolbarSmCandidate.minHeight : toolbarXs;

    const paddingTop = theme.custom.layout.page.paddingTop;
    const paddingBottom = theme.custom.layout.page.paddingBottom;

    return {
        xs: `calc(100dvh - ${toolbarXs}px - ${theme.spacing(paddingTop.xs)} - ${theme.spacing(paddingBottom.xs)})`,
        sm: `calc(100dvh - ${toolbarSm}px - ${theme.spacing(paddingTop.sm)} - ${theme.spacing(paddingBottom.sm)})`,
        md: `calc(100dvh - ${toolbarSm}px - ${theme.spacing(paddingTop.md)} - ${theme.spacing(paddingBottom.md)})`
    };
}

/**
 * Convert a goal mode and deficit magnitude into the signed deficit value expected by the backend.
 *
 * Notes:
 * - positive values => weight loss deficit
 * - negative values => weight gain surplus
 */
function getSignedDailyDeficit(goalMode: GoalMode | null, deficitAbs: number): number | null {
    if (!goalMode) return null;
    if (goalMode === 'maintain') return 0;
    if (goalMode === 'gain') return -Math.abs(deficitAbs);
    return Math.abs(deficitAbs);
}

type ProfileUpdatePayload = {
    timezone: string | null;
    date_of_birth: string | null;
    sex: string | null;
    activity_level: string | null;
    height_cm?: string | null;
    height_feet?: string | null;
    height_inches?: string | null;
};

/**
 * Best-effort detection of the user's primary locale string.
 *
 * Used only to infer input units during onboarding. Users can always change units later.
 */
function getDetectedLocale(): string {
    if (typeof navigator === 'undefined') return '';
    return navigator.language || navigator.languages?.[0] || '';
}

/**
 * Best-effort detection of the user's IANA timezone identifier.
 *
 * We use this to assign the user's "day boundary" for food/weight logs without asking up front.
 */
function getDetectedTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/**
 * Build the profile PATCH payload for the backend, matching the selected height input style.
 */
function buildProfilePayload(opts: {
    timezone: string;
    dob: string;
    sex: string;
    activityLevel: string;
    heightUnit: HeightUnit;
    heightCm: string;
    heightFeet: string;
    heightInches: string;
}): ProfileUpdatePayload {
    const payload: ProfileUpdatePayload = {
        timezone: opts.timezone.trim() || null,
        date_of_birth: opts.dob || null,
        sex: opts.sex || null,
        activity_level: opts.activityLevel || null
    };

    if (opts.heightUnit === HEIGHT_UNITS.CM) {
        payload.height_cm = opts.heightCm || null;
        return payload;
    }

    payload.height_feet = opts.heightFeet || null;
    payload.height_inches = opts.heightInches || null;
    return payload;
}

/**
 * Derive the question sequence for the "Goal" section.
 *
 * We infer the goal direction (lose/gain/maintain) from current vs target weight to avoid asking users
 * to separately pick a "goal type" that could contradict their target.
 *
 * We keep the overall onboarding to two sections, but within each section we ask one question at a time
 * (explicit confirmation avoids jarring "new fields appear mid-typing").
 */
function getGoalsQuestionSequence(goalMode: GoalMode | null): GoalsQuestionKey[] {
    if (goalMode === 'lose' || goalMode === 'gain') {
        return ['currentWeight', 'targetWeight', 'pace'];
    }

    // If we can't infer a direction yet (missing weights), keep the flow focused on weights first.
    return ['currentWeight', 'targetWeight'];
}

const ABOUT_QUESTION_SEQUENCE: AboutQuestionKey[] = ['dob', 'sex', 'activityLevel', 'height'];
const SUMMARY_HIGHLIGHT_DURATION_MS = 900; // Duration for "just confirmed" answer highlight before returning to normal.

const INITIAL_ATTEMPTED_GOALS_QUESTIONS: Record<GoalsQuestionKey, boolean> = {
    currentWeight: false,
    targetWeight: false,
    pace: false
};

const INITIAL_ATTEMPTED_ABOUT_QUESTIONS: Record<AboutQuestionKey, boolean> = {
    dob: false,
    sex: false,
    activityLevel: false,
    height: false
};

/**
 * Onboarding orchestrates the multi-step setup flow and persists profile/goal data.
 */
const Onboarding: React.FC = () => {
    const theme = useTheme();
    const { user, updateProfile, updateUnitPreferences } = useAuth();
    const navigate = useNavigate();
    const prefersReducedMotion = usePrefersReducedMotion();

    const onboardingCardMinHeight = useMemo(() => getOnboardingCardMinHeight(theme), [theme]);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const steps: OnboardingStep[] = useMemo(
        () => [
            {
                key: 'goals',
                label: 'Goal'
            },
            {
                key: 'about',
                label: 'Calorie burn'
            },
            {
                key: 'import',
                label: 'Import'
            }
        ],
        []
    );

    const [stage, setStage] = useState<OnboardingStage>('intro');
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const activeStep = steps[activeStepIndex];

    const [goalsQuestionIndex, setGoalsQuestionIndex] = useState(0);
    const [aboutQuestionIndex, setAboutQuestionIndex] = useState(0);

    const [attemptedGoalsQuestions, setAttemptedGoalsQuestions] = useState<Record<GoalsQuestionKey, boolean>>(() => ({
        ...INITIAL_ATTEMPTED_GOALS_QUESTIONS
    }));
    const [attemptedAboutQuestions, setAttemptedAboutQuestions] = useState<Record<AboutQuestionKey, boolean>>(() => ({
        ...INITIAL_ATTEMPTED_ABOUT_QUESTIONS
    }));

    const detectedLocale = useMemo(() => getDetectedLocale(), []);
    const localeUnitDefaults = useMemo(() => getDefaultUnitPreferencesForLocale(detectedLocale), [detectedLocale]);

    const userWeightUnit = user?.weight_unit;
    const userHeightUnit = user?.height_unit;
    const inferredUnits = useMemo(() => {
        // Prefer locale inference unless the user has already picked a non-default unit pairing.
        if (
            userWeightUnit &&
            userHeightUnit &&
            (userWeightUnit !== WEIGHT_UNITS.KG || userHeightUnit !== HEIGHT_UNITS.CM)
        ) {
            return { weightUnit: userWeightUnit, heightUnit: userHeightUnit };
        }
        return localeUnitDefaults;
    }, [localeUnitDefaults, userHeightUnit, userWeightUnit]);

    const [hasCustomizedUnits, setHasCustomizedUnits] = useState(false);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => inferredUnits.weightUnit);
    const [heightUnit, setHeightUnit] = useState<HeightUnit>(() => inferredUnits.heightUnit);

    // Initialize units from inference once, but don't fight the user after they toggle.
    useEffect(() => {
        if (hasCustomizedUnits) return;
        setWeightUnit(inferredUnits.weightUnit);
        setHeightUnit(inferredUnits.heightUnit);
    }, [hasCustomizedUnits, inferredUnits.heightUnit, inferredUnits.weightUnit]);

    const detectedTimezone = useMemo(() => getDetectedTimezone(), []);
    const resolvedTimezone = useMemo(() => {
        const saved = user?.timezone;
        if (typeof saved === 'string' && saved.trim().length > 0 && saved !== 'UTC') {
            return saved;
        }
        return detectedTimezone;
    }, [detectedTimezone, user?.timezone]);

    const [sex, setSex] = useState('');
    const [dob, setDob] = useState('');
    const [activityLevel, setActivityLevel] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [currentWeight, setCurrentWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [dailyDeficit, setDailyDeficit] = useState(DEFAULT_DAILY_DEFICIT_CHOICE_STRING);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [goalsHighlightKey, setGoalsHighlightKey] = useState<GoalsQuestionKey | null>(null);
    const [aboutHighlightKey, setAboutHighlightKey] = useState<AboutQuestionKey | null>(null);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [importSummary, setImportSummary] = useState<LoseItImportSummary | null>(null);

    const profileQuery = useUserProfileQuery({ enabled: !!user });

    useEffect(() => {
        if (stage !== 'intro') return;
        if (profileQuery.isSuccess) {
            const missing = profileQuery.data?.calorieSummary?.missing ?? [];
            const hasGoal = profileQuery.data?.goal_daily_deficit !== null && profileQuery.data?.goal_daily_deficit !== undefined;
            const hasTimezone =
                typeof profileQuery.data?.profile?.timezone === 'string' && profileQuery.data.profile.timezone.trim().length > 0;
            if (missing.length === 0 && hasGoal && hasTimezone) {
                navigate('/log', { replace: true });
            }
        }
    }, [navigate, profileQuery.data, profileQuery.isSuccess, stage]);

    const heightFieldsValid = useMemo(() => {
        if (heightUnit === HEIGHT_UNITS.CM) {
            return Boolean(heightCm);
        }
        return Boolean(heightFeet);
    }, [heightCm, heightFeet, heightUnit]);

    const aboutStepValid = Boolean(dob) && Boolean(sex) && Boolean(activityLevel) && heightFieldsValid;

    const currentWeightNumber = useMemo(() => parseFiniteNumber(currentWeight), [currentWeight]);
    const targetWeightNumber = useMemo(() => parseFiniteNumber(targetWeight), [targetWeight]);
    const hasCurrentWeight = currentWeightNumber !== null && currentWeightNumber > 0;
    const hasTargetWeight = targetWeightNumber !== null && targetWeightNumber > 0;

    const inferredGoalMode = useMemo(
        () => inferGoalModeFromWeights(currentWeightNumber, targetWeightNumber),
        [currentWeightNumber, targetWeightNumber]
    );

    const goalsStepValid = useMemo(() => {
        if (!hasCurrentWeight) return false;
        if (!hasTargetWeight) return false;
        return inferredGoalMode !== null;
    }, [hasCurrentWeight, hasTargetWeight, inferredGoalMode]);

    const goalsQuestionSequence = useMemo(() => getGoalsQuestionSequence(inferredGoalMode), [inferredGoalMode]);
    const goalsQuestionKey = goalsQuestionIndex < goalsQuestionSequence.length ? goalsQuestionSequence[goalsQuestionIndex] : null;
    const goalsCompletedKeys = useMemo(
        () => goalsQuestionSequence.slice(0, Math.min(goalsQuestionIndex, goalsQuestionSequence.length)),
        [goalsQuestionIndex, goalsQuestionSequence]
    );

    const aboutQuestionKey = aboutQuestionIndex < ABOUT_QUESTION_SEQUENCE.length ? ABOUT_QUESTION_SEQUENCE[aboutQuestionIndex] : null;
    const aboutCompletedKeys = useMemo(
        () => ABOUT_QUESTION_SEQUENCE.slice(0, Math.min(aboutQuestionIndex, ABOUT_QUESTION_SEQUENCE.length)),
        [aboutQuestionIndex]
    );

    // Clamp in case the inferred goal direction changes the question sequence (e.g. target becomes "maintain").
    useEffect(() => {
        setGoalsQuestionIndex((current) => Math.min(current, goalsQuestionSequence.length));
    }, [goalsQuestionSequence.length]);

    const scrollContentToBottom = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
        container.scrollTo({ top: container.scrollHeight, behavior });
    }, [prefersReducedMotion]);

    useEffect(() => {
        if (goalsHighlightKey === null) return;
        const id = window.setTimeout(() => setGoalsHighlightKey(null), SUMMARY_HIGHLIGHT_DURATION_MS);
        return () => window.clearTimeout(id);
    }, [goalsHighlightKey]);

    useEffect(() => {
        if (aboutHighlightKey === null) return;
        const id = window.setTimeout(() => setAboutHighlightKey(null), SUMMARY_HIGHLIGHT_DURATION_MS);
        return () => window.clearTimeout(id);
    }, [aboutHighlightKey]);

    // After confirming an answer, keep the newest summary row visible by gently scrolling the content area.
    useEffect(() => {
        if (stage !== 'wizard') return;
        if (activeStep.key !== 'goals') return;
        if (goalsHighlightKey === null) return;

        const id = window.setTimeout(() => scrollContentToBottom(), prefersReducedMotion ? 0 : 80);
        return () => window.clearTimeout(id);
    }, [activeStep.key, goalsHighlightKey, prefersReducedMotion, scrollContentToBottom, stage]);

    useEffect(() => {
        if (stage !== 'wizard') return;
        if (activeStep.key !== 'about') return;
        if (aboutHighlightKey === null) return;

        const id = window.setTimeout(() => scrollContentToBottom(), prefersReducedMotion ? 0 : 80);
        return () => window.clearTimeout(id);
    }, [aboutHighlightKey, activeStep.key, prefersReducedMotion, scrollContentToBottom, stage]);

    const editGoalsQuestion = useCallback(
        (key: GoalsQuestionKey) => {
            const index = goalsQuestionSequence.indexOf(key);
            if (index === -1) return;
            setError('');
            setActiveStepIndex(0);
            setGoalsQuestionIndex(index);
        },
        [goalsQuestionSequence]
    );

    const editAboutQuestion = useCallback((key: AboutQuestionKey) => {
        const index = ABOUT_QUESTION_SEQUENCE.indexOf(key);
        if (index === -1) return;
        setError('');
        setActiveStepIndex(1);
        setAboutQuestionIndex(index);
    }, []);

    const enterWizard = useCallback(() => {
        setStage('wizard');
        setActiveStepIndex(0);
        setGoalsQuestionIndex(0);
        setAboutQuestionIndex(0);
        setAttemptedGoalsQuestions({ ...INITIAL_ATTEMPTED_GOALS_QUESTIONS });
        setAttemptedAboutQuestions({ ...INITIAL_ATTEMPTED_ABOUT_QUESTIONS });
        setImportSummary(null);
        setIsImportDialogOpen(false);
        setError('');
    }, []);

    const setWeightUnitPreference = useCallback(
        (nextUnit: WeightUnit) => {
            if (nextUnit === weightUnit) return;
            setHasCustomizedUnits(true);
            setWeightUnit(nextUnit);

            setCurrentWeight((value) => convertWeightInputString(value, weightUnit, nextUnit));
            setTargetWeight((value) => convertWeightInputString(value, weightUnit, nextUnit));
        },
        [weightUnit]
    );

    const setHeightUnitPreference = useCallback(
        (nextUnit: HeightUnit) => {
            if (nextUnit === heightUnit) return;
            setHasCustomizedUnits(true);

            if (nextUnit === HEIGHT_UNITS.FT_IN) {
                const converted = convertHeightCmStringToFeetInches(heightCm);
                setHeightFeet(converted.feet);
                setHeightInches(converted.inches);
                setHeightUnit(HEIGHT_UNITS.FT_IN);
                return;
            }

            setHeightCm(convertHeightFeetInchesStringsToCm(heightFeet, heightInches));
            setHeightUnit(HEIGHT_UNITS.CM);
        },
        [heightCm, heightFeet, heightInches, heightUnit]
    );

    const goContinue = () => {
        setError('');

        if (activeStep.key === 'goals') {
            if (!goalsQuestionKey) {
                setActiveStepIndex(1);
                return;
            }

            setAttemptedGoalsQuestions((current) => ({ ...current, [goalsQuestionKey]: true }));

            let isValid = true;
            if (goalsQuestionKey === 'currentWeight') {
                isValid = hasCurrentWeight;
            } else if (goalsQuestionKey === 'targetWeight') {
                isValid = hasTargetWeight;
            }
            if (!isValid) return;

            setGoalsHighlightKey(goalsQuestionKey);

            const nextIndex = goalsQuestionIndex + 1;
            setGoalsQuestionIndex(nextIndex);

            if (nextIndex >= goalsQuestionSequence.length) {
                setActiveStepIndex(1);
            }
            return;
        }

        if (activeStep.key === 'import') {
            void handleFinish();
            return;
        }

        if (!aboutQuestionKey) {
            setActiveStepIndex(2);
            return;
        }

        setAttemptedAboutQuestions((current) => ({ ...current, [aboutQuestionKey]: true }));

        let isValid = true;
        if (aboutQuestionKey === 'dob') {
            isValid = Boolean(dob);
        } else if (aboutQuestionKey === 'sex') {
            isValid = Boolean(sex);
        } else if (aboutQuestionKey === 'activityLevel') {
            isValid = Boolean(activityLevel);
        } else if (aboutQuestionKey === 'height') {
            isValid = heightFieldsValid;
        }
        if (!isValid) return;

        setAboutHighlightKey(aboutQuestionKey);

        const nextIndex = aboutQuestionIndex + 1;
        if (nextIndex >= ABOUT_QUESTION_SEQUENCE.length) {
            setActiveStepIndex(2);
            return;
        }

        setAboutQuestionIndex(nextIndex);
    };

    const goBack = () => {
        setError('');

        if (activeStep.key === 'goals') {
            if (goalsQuestionIndex === 0) {
                setStage('intro');
                setActiveStepIndex(0);
                setGoalsQuestionIndex(0);
                setAboutQuestionIndex(0);
                setAttemptedGoalsQuestions({ ...INITIAL_ATTEMPTED_GOALS_QUESTIONS });
                setAttemptedAboutQuestions({ ...INITIAL_ATTEMPTED_ABOUT_QUESTIONS });
                return;
            }
            setGoalsQuestionIndex((current) => Math.max(current - 1, 0));
            return;
        }

        if (activeStep.key === 'import') {
            setActiveStepIndex(1);
            setAboutQuestionIndex(Math.max(ABOUT_QUESTION_SEQUENCE.length - 1, 0));
            return;
        }

        if (aboutQuestionIndex === 0) {
            setActiveStepIndex(0);
            setGoalsQuestionIndex(Math.max(goalsQuestionSequence.length - 1, 0));
            return;
        }

        setAboutQuestionIndex((current) => Math.max(current - 1, 0));
    };

    const handleFinish = async () => {
        setError('');
        if (!user) {
            setError('You must be logged in to continue.');
            return;
        }

        if (!goalsStepValid) {
            setActiveStepIndex(0);
            if (!hasCurrentWeight) {
                setGoalsQuestionIndex(0);
                setAttemptedGoalsQuestions((current) => ({ ...current, currentWeight: true }));
                return;
            }
            if (!hasTargetWeight) {
                setGoalsQuestionIndex(goalsQuestionSequence.indexOf('targetWeight'));
                setAttemptedGoalsQuestions((current) => ({ ...current, targetWeight: true }));
                return;
            }
            return;
        }
        if (!aboutStepValid) {
            setActiveStepIndex(1);
            if (!dob) {
                setAboutQuestionIndex(0);
                setAttemptedAboutQuestions((current) => ({ ...current, dob: true }));
                return;
            }
            if (!sex) {
                setAboutQuestionIndex(1);
                setAttemptedAboutQuestions((current) => ({ ...current, sex: true }));
                return;
            }
            if (!activityLevel) {
                setAboutQuestionIndex(2);
                setAttemptedAboutQuestions((current) => ({ ...current, activityLevel: true }));
                return;
            }
            if (!heightFieldsValid) {
                setAboutQuestionIndex(3);
                setAttemptedAboutQuestions((current) => ({ ...current, height: true }));
                return;
            }
            return;
        }

        setIsSaving(true);
        try {
            const profilePayload = buildProfilePayload({
                timezone: resolvedTimezone,
                dob,
                sex,
                activityLevel,
                heightUnit,
                heightCm,
                heightFeet,
                heightInches
            });

            await updateProfile(profilePayload);

            // Persist unit defaults so backend parsing and subsequent pages match what the user entered.
            if (user.weight_unit !== weightUnit || user.height_unit !== heightUnit) {
                await updateUnitPreferences({ weight_unit: weightUnit, height_unit: heightUnit });
            }

            const deficitAbs = inferredGoalMode === 'maintain' ? 0 : normalizeDailyDeficitChoiceAbsValue(dailyDeficit);
            const signedDeficit = getSignedDailyDeficit(inferredGoalMode, deficitAbs);
            if (signedDeficit === null) {
                setError('Please confirm your goal weights before continuing.');
                return;
            }

            await axios.post('/api/metrics', {
                weight: currentWeight,
                date: formatDateToLocalDateString(new Date(), resolvedTimezone)
            });

            await axios.post('/api/goals', {
                start_weight: currentWeight,
                target_weight: targetWeight,
                daily_deficit: signedDeficit
            });

            await profileQuery.refetch();
            setStage('summary');
        } catch (err) {
            console.error(err);
            if (axios.isAxiosError(err)) {
                const serverMessage = (err.response?.data as { message?: unknown } | undefined)?.message;
                if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
                    setError(serverMessage);
                } else {
                    setError('Failed to save your profile. Please check the fields and try again.');
                }
            } else {
                setError('Failed to save your profile. Please check the fields and try again.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const goToLog = useCallback(() => {
        // Replace so the onboarding summary doesn't stay in the back-stack once setup is complete.
        navigate('/log', { replace: true });
    }, [navigate]);

    const editSetupFromSummary = useCallback(() => {
        setError('');
        setStage('wizard');
        setActiveStepIndex(1);
        setAboutQuestionIndex(Math.max(ABOUT_QUESTION_SEQUENCE.length - 1, 0));
    }, []);

    const footerFadeKey =
        activeStep.key === 'goals'
            ? `goals-${goalsQuestionKey ?? 'done'}`
            : activeStep.key === 'about'
                ? `about-${aboutQuestionKey ?? 'done'}`
                : 'import';

    const isLastAboutQuestion =
        activeStep.key === 'about' && aboutQuestionKey !== null && aboutQuestionIndex === ABOUT_QUESTION_SEQUENCE.length - 1;

    let isCurrentGoalsQuestionValid = false;
    if (activeStep.key === 'goals' && goalsQuestionKey !== null) {
        if (goalsQuestionKey === 'currentWeight') {
            isCurrentGoalsQuestionValid = hasCurrentWeight;
        } else if (goalsQuestionKey === 'targetWeight') {
            isCurrentGoalsQuestionValid = hasTargetWeight;
        } else {
            isCurrentGoalsQuestionValid = true;
        }
    }

    const willAdvanceToCalorieBurn =
        activeStep.key === 'goals' &&
        goalsQuestionKey !== null &&
        isCurrentGoalsQuestionValid &&
        goalsQuestionIndex + 1 >= goalsQuestionSequence.length;

    const goalsProgressLabel = useMemo(() => {
        const current = Math.min(goalsQuestionIndex + 1, goalsQuestionSequence.length);
        return `${current}/${goalsQuestionSequence.length}`;
    }, [goalsQuestionIndex, goalsQuestionSequence.length]);

    const aboutProgressLabel = useMemo(() => {
        const current = Math.min(aboutQuestionIndex + 1, ABOUT_QUESTION_SEQUENCE.length);
        return `${current}/${ABOUT_QUESTION_SEQUENCE.length}`;
    }, [aboutQuestionIndex]);

    const signedDeficitFromState = useMemo(() => {
        const deficitAbs = normalizeDailyDeficitChoiceAbsValue(dailyDeficit);
        return getSignedDailyDeficit(inferredGoalMode, deficitAbs);
    }, [dailyDeficit, inferredGoalMode]);

    let primaryCtaLabel = 'Continue';
    if (activeStep.key === 'import') {
        primaryCtaLabel = isSaving ? 'Saving...' : 'See my plan';
    } else if (activeStep.key === 'about' && isLastAboutQuestion) {
        primaryCtaLabel = 'Next: Import';
    } else if (willAdvanceToCalorieBurn) {
        primaryCtaLabel = 'Next: Calorie burn';
    }

    const isWizardPrimaryDisabled = useMemo(() => {
        if (isSaving) return true;
        if (stage !== 'wizard') return false;

        if (activeStep.key === 'goals') {
            if (goalsQuestionKey === 'currentWeight') return !hasCurrentWeight;
            if (goalsQuestionKey === 'targetWeight') return !hasTargetWeight;
            return false;
        }

        if (activeStep.key === 'about') {
            if (aboutQuestionKey === 'dob') return !dob;
            if (aboutQuestionKey === 'sex') return !sex;
            if (aboutQuestionKey === 'activityLevel') return !activityLevel;
            if (aboutQuestionKey === 'height') return !heightFieldsValid;
        }
        return false;
    }, [
        aboutQuestionKey,
        activityLevel,
        activeStep.key,
        dob,
        goalsQuestionKey,
        hasCurrentWeight,
        hasTargetWeight,
        heightFieldsValid,
        isSaving,
        sex,
        stage
    ]);

    let stepDotsActiveIndex = 0;
    if (stage === 'wizard') {
        stepDotsActiveIndex = activeStepIndex;
    } else if (stage === 'summary') {
        stepDotsActiveIndex = steps.length;
    }

    // Determine which footer question control to show in wizard stage (goal vs about-you).
    // Computing this outside JSX keeps the layout readable and avoids nested conditional rendering.
    let footerQuestionControl: React.ReactNode = null;
    if (stage === 'wizard') {
        if (activeStep.key === 'about') {
            footerQuestionControl = aboutQuestionKey ? (
                <AboutYouQuestionFooter
                    questionKey={aboutQuestionKey}
                    progressLabel={aboutProgressLabel}
                    heightUnit={heightUnit}
                    onSetHeightUnit={setHeightUnitPreference}
                    dob={dob}
                    onDobChange={setDob}
                    sex={sex}
                    onSexChange={setSex}
                    activityLevel={activityLevel}
                    onActivityLevelChange={setActivityLevel}
                    heightCm={heightCm}
                    onHeightCmChange={setHeightCm}
                    heightFeet={heightFeet}
                    onHeightFeetChange={setHeightFeet}
                    heightInches={heightInches}
                    onHeightInchesChange={setHeightInches}
                    showErrors={Boolean(aboutQuestionKey && attemptedAboutQuestions[aboutQuestionKey])}
                    disabled={isSaving}
                    onSubmit={goContinue}
                />
            ) : null;
        } else if (activeStep.key === 'goals') {
            footerQuestionControl = goalsQuestionKey ? (
                <GoalsQuestionFooter
                    questionKey={goalsQuestionKey}
                    progressLabel={goalsProgressLabel}
                    weightUnit={weightUnit}
                    onSetWeightUnit={setWeightUnitPreference}
                    currentWeight={currentWeight}
                    onCurrentWeightChange={setCurrentWeight}
                    targetWeight={targetWeight}
                    onTargetWeightChange={setTargetWeight}
                    dailyDeficit={dailyDeficit}
                    onDailyDeficitChange={setDailyDeficit}
                    showErrors={Boolean(goalsQuestionKey && attemptedGoalsQuestions[goalsQuestionKey])}
                    disabled={isSaving}
                    onSubmit={goContinue}
                />
            ) : null;
        }
    }

    let cardBodyContent: React.ReactNode = null;
    if (stage === 'intro') {
        cardBodyContent = (
            <Box>
                <Typography variant="h4" gutterBottom>
                    Welcome to calibrate
                </Typography>
                <Typography color="text.secondary">
                    Let&apos;s set a daily calorie target that helps you reach your weight goal.
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Three quick steps: set your target weight, estimate calorie burn, and optionally import history.
                </Typography>
            </Box>
        );
    } else if (stage === 'summary') {
        cardBodyContent = (
            <OnboardingPlanSummary
                dailyTarget={profileQuery.data?.calorieSummary?.dailyCalorieTarget}
                tdee={profileQuery.data?.calorieSummary?.tdee}
                bmr={profileQuery.data?.calorieSummary?.bmr}
                deficit={profileQuery.data?.calorieSummary?.deficit ?? profileQuery.data?.goal_daily_deficit ?? signedDeficitFromState}
                activityLevel={profileQuery.data?.profile?.activity_level ?? null}
                startWeight={currentWeightNumber}
                targetWeight={targetWeightNumber}
                unitLabel={weightUnit === WEIGHT_UNITS.LB ? 'lb' : 'kg'}
            />
        );
    } else {
        cardBodyContent = (
            <Box
                // Key forces a clean re-mount between steps so the transition feels intentional.
                key={activeStep.key}
            >
                <Fade in key={activeStep.key} timeout={prefersReducedMotion ? 0 : 180}>
                    {/*
                      MUI transitions require a single child that can hold a ref.
                      Wrapping our step components in a Box avoids null ref crashes.
                    */}
                    <Box>
                        {activeStep.key === 'about' ? (
                            <AboutYouStep
                                heightUnit={heightUnit}
                                dob={dob}
                                sex={sex}
                                activityLevel={activityLevel}
                                heightCm={heightCm}
                                heightFeet={heightFeet}
                                heightInches={heightInches}
                                completedKeys={aboutCompletedKeys}
                                onEditQuestion={editAboutQuestion}
                                prefersReducedMotion={prefersReducedMotion}
                                highlightKey={aboutHighlightKey}
                            />
                        ) : activeStep.key === 'import' ? (
                            <ImportStep
                                onOpenImport={() => setIsImportDialogOpen(true)}
                                summary={importSummary}
                            />
                        ) : (
                            <GoalsStep
                                weightUnit={weightUnit}
                                currentWeight={currentWeight}
                                targetWeight={targetWeight}
                                dailyDeficit={dailyDeficit}
                                completedKeys={goalsCompletedKeys}
                                onEditQuestion={editGoalsQuestion}
                                prefersReducedMotion={prefersReducedMotion}
                                highlightKey={goalsHighlightKey}
                            />
                        )}
                    </Box>
                </Fade>
            </Box>
        );
    }

    let cardFooterContent: React.ReactNode = null;
    if (stage === 'intro') {
        cardFooterContent = (
            <Box sx={{ pt: 2 }}>
                <Button variant="contained" onClick={enterWizard} fullWidth>
                    Let&apos;s get started
                </Button>
            </Box>
        );
    } else if (stage === 'summary') {
        cardFooterContent = (
            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center" sx={{ pt: 2 }}>
                <Button variant="text" onClick={editSetupFromSummary} disabled={isSaving}>
                    Edit setup
                </Button>
                <Button variant="contained" onClick={goToLog} disabled={isSaving}>
                    Start logging
                </Button>
            </Stack>
        );
    } else {
        cardFooterContent = (
            <Stack spacing={ONBOARDING_FOOTER_SPACING} sx={{ pt: 2 }}>
                <Fade in key={footerFadeKey} timeout={prefersReducedMotion ? 0 : 160}>
                    {/* MUI transitions require a single child that can hold a ref. */}
                    <Box>{footerQuestionControl}</Box>
                </Fade>

                <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
                    <Button variant="text" onClick={goBack} disabled={isSaving}>
                        Back
                    </Button>

                    <Button variant="contained" onClick={goContinue} disabled={isWizardPrimaryDisabled}>
                        {primaryCtaLabel}
                    </Button>
                </Stack>
            </Stack>
        );
    }

    return (
        <AppPage
            maxWidth="content"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: onboardingCardMinHeight
            }}
        >
            <Box sx={{ mb: 2 }}>
                <OnboardingStepDots
                    steps={steps}
                    activeStepIndex={stepDotsActiveIndex}
                />
            </Box>

            <AppCard
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column'
                }}
                contentSx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                }}
            >
                <Box ref={scrollContainerRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <Stack spacing={ONBOARDING_CARD_CONTENT_SPACING}>
                        {cardBodyContent}
                    </Stack>
                </Box>

                <Divider sx={{ mt: 2 }} />

                {cardFooterContent}
            </AppCard>

            <LoseItImportDialog
                open={isImportDialogOpen}
                onClose={() => setIsImportDialogOpen(false)}
                onComplete={(summary) => setImportSummary(summary)}
                defaultWeightUnit={weightUnit}
            />

            <Snackbar
                open={Boolean(error)}
                autoHideDuration={8000}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                onClose={(_event, reason) => {
                    if (reason === 'clickaway') return;
                    setError('');
                }}
            >
                <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>
                    {error}
                </Alert>
            </Snackbar>
        </AppPage>
    );
};

export default Onboarding;
