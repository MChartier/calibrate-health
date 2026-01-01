import React from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    CircularProgress,
    Divider,
    IconButton,
    Link,
    Stack,
    Tooltip,
    Typography
} from '@mui/material';
import InfoIcon from '@mui/icons-material/InfoRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import { Link as RouterLink } from 'react-router-dom';
import { useUserProfileQuery } from '../queries/userProfile';
import { useI18n } from '../i18n/useI18n';
import { getActivityLevelOptions } from '../constants/activityLevels';

/**
 * CalorieTargetBanner
 *
 * Intent:
 * - Surface the user's calorie target prominently on dashboard/profile.
 * - Make the math transparent: BMR (sex/age/height/weight) -> activity multiplier -> goal adjustment -> target.
 * - Use an "invoice" style breakdown: green positives (energy available), red negatives (deficit), right-aligned numbers, clear total.
 *
 * UX rationale:
 * - If data is missing, explain which inputs are needed.
 * - Dashboard keeps details behind a tooltip to stay "at a glance"; Profile inlines the same breakdown in a collapsible section.
 * - Colors reinforce add/remove semantics while keeping the primary target readable in neutral text.
 */

export type CalorieTargetBannerProps = {
    /**
     * When true, renders the dashboard variant (clickable CardActionArea linking to `/profile`).
     */
    isDashboard?: boolean;
};

const TOOLTIP_MAX_WIDTH_PX = 320;
const INLINE_DETAILS_MAX_WIDTH_PX = 520;
const INLINE_ACCORDION_SUMMARY_MIN_HEIGHT_PX = 48;
const INLINE_ACCORDION_SUMMARY_CONTENT_MARGIN_Y = 1.5;

/**
 * Stop nested controls (tooltip icon, retry button) from triggering the surrounding dashboard CardActionArea navigation.
 */
function stopDashboardCardNavigation(event: React.SyntheticEvent) {
    event.stopPropagation();
}

const CalorieTargetBanner: React.FC<CalorieTargetBannerProps> = ({ isDashboard = false }) => {
    const { t } = useI18n();
    const { data, isLoading, isError, refetch } = useUserProfileQuery();

    const calorieSummary = data?.calorieSummary;

    const missing = calorieSummary?.missing || [];
    const hasTarget = typeof calorieSummary?.dailyCalorieTarget === 'number';

    const bmr = calorieSummary?.bmr;
    const tdee = calorieSummary?.tdee;
    const goalDailyDeficit = data?.goal_daily_deficit ?? null;
    const deficit = calorieSummary?.deficit ?? goalDailyDeficit;
    const dailyTarget = calorieSummary?.dailyCalorieTarget;

    const hasGoalDeficit = typeof goalDailyDeficit === 'number';

    const activityDelta =
        typeof tdee === 'number' && typeof bmr === 'number' ? Math.round((tdee - bmr) * 10) / 10 : undefined;
    const activityMultiplier =
        typeof tdee === 'number' && typeof bmr === 'number' && bmr !== 0 ? Math.round((tdee / bmr) * 1000) / 1000 : undefined;
    // Daily target is computed as `TDEE - deficit`. A surplus is represented as a negative deficit value.
    const goalDelta = typeof deficit === 'number' ? -deficit : undefined;

    const activityLevelOptions = React.useMemo(() => getActivityLevelOptions(t), [t]);
    const activityLevelTitle = React.useMemo(() => {
        const activityLevel = data?.profile.activity_level;
        if (!activityLevel) return null;
        return activityLevelOptions.find((option) => option.value === activityLevel)?.title ?? activityLevel;
    }, [activityLevelOptions, data?.profile.activity_level]);

    const breakdownDetails = hasTarget ? (
        <Stack spacing={1} divider={<Divider />}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                    <Typography variant="body2">{t('calorieTarget.breakdown.bmr.title')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('calorieTarget.breakdown.bmr.caption')}
                    </Typography>
                </Box>
                <Typography
                    variant="body2"
                    sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: 96 }}
                >
                    {typeof bmr === 'number' ? `+${bmr} kcal` : '—'}
                </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                    <Typography variant="body2">{t('calorieTarget.breakdown.activity.title')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('calorieTarget.breakdown.activity.caption', {
                            level: activityLevelTitle ?? '—',
                            multiplier: activityMultiplier ?? '—'
                        })}
                    </Typography>
                </Box>
                <Typography
                    variant="body2"
                    sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: 96 }}
                >
                    {activityDelta !== undefined ? `+${activityDelta} kcal` : '+ —'}
                </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                    <Typography variant="body2">{t('calorieTarget.breakdown.goal.title')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('calorieTarget.breakdown.goal.caption')}
                    </Typography>
                </Box>
                <Typography
                    variant="body2"
                    sx={{
                        color: (theme) =>
                            goalDelta !== undefined && goalDelta < 0 ? theme.palette.error.main : theme.palette.success.main,
                        textAlign: 'right',
                        minWidth: 96
                    }}
                >
                    {goalDelta !== undefined ? `${goalDelta > 0 ? '+' : ''}${goalDelta} kcal` : '—'}
                </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                    {t('calorieTarget.breakdown.target.title')}
                </Typography>
                <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ textAlign: 'right', minWidth: 96 }}>
                    {dailyTarget !== undefined ? `${Math.round(dailyTarget)} kcal` : '—'}
                </Typography>
            </Box>
        </Stack>
    ) : (
        <Box>
            <Typography variant="body2">
                {t('calorieTarget.missing.intro1')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
                {t('calorieTarget.missing.intro2')}
            </Typography>
            {!isDashboard && (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {missing.includes('latest_weight') && (
                        <Typography variant="body2">
                            <Link component={RouterLink} to="/log">
                                {t('calorieTarget.missing.addWeighInLink', { log: t('nav.log') })}
                            </Link>
                        </Typography>
                    )}
                    {!hasGoalDeficit && (
                        <Typography variant="body2">
                            <Link component={RouterLink} to="/goals">
                                {t('calorieTarget.missing.setDeficitLink', { goals: t('nav.goals') })}
                            </Link>
                        </Typography>
                    )}
                    {missing.some((field) => field !== 'latest_weight') && (
                        <Typography variant="body2" color="text.secondary">
                            {t('calorieTarget.missing.fillProfileHint')}
                        </Typography>
                    )}
                </Stack>
            )}
        </Box>
    );

    const tooltipContent = (
        <Box sx={{ maxWidth: TOOLTIP_MAX_WIDTH_PX }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('calorieTarget.tooltipTitle')}
            </Typography>
            {breakdownDetails}
        </Box>
    );

    let cardBody: React.ReactNode;
    if (isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography>{t('calorieTarget.loadingTargets')}</Typography>
            </Box>
        );
    } else if (isError || !data || !calorieSummary) {
        cardBody = (
            <Alert
                severity="warning"
                action={
                    <Button color="inherit" size="small" onClick={(event) => { stopDashboardCardNavigation(event); void refetch(); }}>
                        {t('calorieTarget.retry')}
                    </Button>
                }
            >
                {t('calorieTarget.error.unableToLoad')}
            </Alert>
        );
    } else if (hasTarget) {
        cardBody = (
            <>
                <Typography variant="h4" color="primary">
                    {Math.round(dailyTarget!)} kcal/day
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('calorieTarget.summaryLine', { tdee: tdee ?? '—', deficit: deficit ?? '—' })}
                    {!isDashboard && (
                        <>
                            {' '}
                            <Link component={RouterLink} to="/goals">
                                {t('calorieTarget.changeDeficit')}
                            </Link>
                        </>
                    )}
                </Typography>
            </>
        );
    } else {
        cardBody = (
            <Alert severity="info">
                {t('calorieTarget.infoMissing')}
                {!isDashboard && (
                    <>
                        {' '}
                        <Link component={RouterLink} to="/goals">
                            {t('calorieTarget.missing.setDeficitLink', { goals: t('nav.goals') })}
                        </Link>
                        .
                    </>
                )}
            </Alert>
        );
    }

    const inlineDetails = !isDashboard && !isLoading && !isError && calorieSummary ? (
        <Box sx={{ mt: 1 }}>
            <Accordion
                disableGutters
                elevation={0}
                sx={{
                    // MUI adds an expanded-state margin; remove it so the accordion top edge stays locked in place.
                    '&&': { margin: 0 },
                    '&&.Mui-expanded': { margin: 0 },
                    '&& .MuiAccordionSummary-root': {
                        minHeight: INLINE_ACCORDION_SUMMARY_MIN_HEIGHT_PX,
                        '&.Mui-expanded': { minHeight: INLINE_ACCORDION_SUMMARY_MIN_HEIGHT_PX }
                    },
                    '&& .MuiAccordionSummary-content': {
                        my: INLINE_ACCORDION_SUMMARY_CONTENT_MARGIN_Y,
                        '&.Mui-expanded': { my: INLINE_ACCORDION_SUMMARY_CONTENT_MARGIN_Y }
                    },
                    '&&::before': { display: 'none' }
                }}
            >
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="calorie-target-details"
                    id="calorie-target-details-header"
                >
                    <Typography variant="subtitle2">{t('calorieTarget.details.accordionTitle')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ maxWidth: INLINE_DETAILS_MAX_WIDTH_PX }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {t('calorieTarget.details.accordionCaption')}
                        </Typography>
                        {breakdownDetails}
                    </Box>
                </AccordionDetails>
            </Accordion>
        </Box>
    ) : null;

    const ctaLine = isDashboard ? (
        <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
            {t('calorieTarget.cta.editProfile')}
        </Typography>
    ) : null;

    const content = (
        <CardContent>
            <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="h6">{t('calorieTarget.cardTitle')}</Typography>
                    {isDashboard && (
                        <Tooltip title={tooltipContent} arrow enterTouchDelay={0}>
                            <IconButton
                                size="small"
                                aria-label={t('calorieTarget.tooltipAria')}
                                onClick={stopDashboardCardNavigation}
                                onMouseDown={stopDashboardCardNavigation}
                            >
                                <InfoIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {cardBody}

                {!hasTarget && !isLoading && !isError && missing.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {t('calorieTarget.missingFieldsLine', { fields: missing.join(', ') })}
                    </Typography>
                )}

                {ctaLine}
                {inlineDetails}
            </Stack>
        </CardContent>
    );

    return (
        <Card
            sx={{
                mb: 2,
                width: '100%',
                ...(isDashboard
                    ? {
                        transition: 'transform 120ms ease',
                        '&:hover': { transform: 'translateY(-2px)' }
                    }
                    : null)
            }}
        >
            {isDashboard ? (
                <CardActionArea component={RouterLink} to="/profile">
                    {content}
                </CardActionArea>
            ) : (
                content
            )}
        </Card>
    );
};

export default CalorieTargetBanner;
