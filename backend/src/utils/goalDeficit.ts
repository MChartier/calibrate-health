/**
 * Backend-facing re-exports for shared goal deficit validation utilities.
 *
 * Keeping these centralized ensures the API and frontend stay aligned on allowed deficit choices.
 */
export {
    ALLOWED_DAILY_DEFICIT_ABS_VALUES,
    DEFAULT_DAILY_DEFICIT_CHOICE_ABS_VALUE,
    normalizeDailyDeficitChoiceAbsValue,
    parseDailyDeficit
} from '../../../shared/goalDeficit';
