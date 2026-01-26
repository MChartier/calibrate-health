import React from 'react';
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography, useMediaQuery } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { Link as RouterLink } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import {
    formatDateToLocalDateString,
    formatIsoDateForDisplay,
    getBirthdayEmojiForIsoDate,
    getHolidayEmojiForIsoDate
} from '../utils/date';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useUserProfileQuery } from '../queries/userProfile';
import { useFoodLogQuery } from '../queries/foodLog';
import { useI18n } from '../i18n/useI18n';

/**
 * Log summary card UI for daily calories vs target.
 *
 * Handles local-date math, gauge animation, and dashboard vs /log presentation.
 */
const GAUGE_DIMENSIONS_DEFAULT = { width: 200, height: 140 }; // Standard gauge size for sm+ layouts.
const GAUGE_DIMENSIONS_COMPACT = { width: 150, height: 104 }; // Smaller gauge size for xs layouts keeps the card from filling the viewport height.
const GAUGE_START_ANGLE = -90;
const GAUGE_END_ANGLE = 90;
const GAUGE_INNER_RADIUS = '70%';
const GAUGE_OUTER_RADIUS = '90%';
const SUMMARY_SKELETON_VALUE_HEIGHT = 32;
const LOG_SUMMARY_LAYOUT_GAP = { compact: 1, default: 2 }; // Gap between the gauge and the text column; tighter on xs keeps the card shorter.
const LOG_SUMMARY_VALUE_VARIANT = { compact: 'h6', default: 'h5' } as const; // Use a slightly smaller headline on xs to keep the vertical rhythm compact.
const LOG_SUMMARY_CARD_PADDING_SPACING = { xs: 1.25, sm: 1.5 }; // Slightly reduce card padding on xs to reclaim vertical space.
const LOG_SUMMARY_TITLE_MARGIN_BOTTOM_SPACING = { xs: 1, sm: 1.5 }; // Title-to-body spacing; smaller on xs keeps the card dense but readable.
// Duration used for "date switch" value transitions (gauge fill + numbers).
const LOG_SUMMARY_TWEEN_DURATION_MS = 520;

type AnimatedLogSummaryValues = {
    gaugeValue: number;
    remainingCaloriesLabel: number | null;
};

/**
 * Animate the summary gauge + remaining calorie value when switching between dates with data.
 *
 * We animate as a percentage (value/max) so the gauge still transitions smoothly when the max changes
 * (e.g. if a day flips from "under target" to "over target" and the gaugeMax becomes totalCalories).
 */
function useAnimatedLogSummaryValues(args: {
    gaugeValue: number;
    gaugeMax: number;
    remainingCalories: number | null;
    disabled: boolean;
}): AnimatedLogSummaryValues {
    const gaugePercentTarget = args.gaugeMax > 0 ? args.gaugeValue / args.gaugeMax : 0;
    const remainingAbsTarget = args.remainingCalories !== null ? Math.abs(args.remainingCalories) : null;

    const rafRef = React.useRef<number | null>(null);
    const valueRef = React.useRef({
        gaugePercent: gaugePercentTarget,
        remainingAbs: remainingAbsTarget ?? 0
    });
    const [animated, setAnimated] = React.useState(() => ({
        gaugePercent: gaugePercentTarget,
        remainingAbs: remainingAbsTarget ?? 0
    }));

    React.useEffect(() => {
        valueRef.current = animated;
    }, [animated]);

    React.useEffect(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const targetRemainingAbs = remainingAbsTarget ?? 0;
        const targetGaugePercent = Number.isFinite(gaugePercentTarget) ? gaugePercentTarget : 0;

        if (args.disabled || LOG_SUMMARY_TWEEN_DURATION_MS <= 0) {
            if (
                valueRef.current.gaugePercent === targetGaugePercent &&
                valueRef.current.remainingAbs === targetRemainingAbs
            ) {
                return () => {};
            }

            const next = { gaugePercent: targetGaugePercent, remainingAbs: targetRemainingAbs };
            valueRef.current = next;

            // Avoid calling setState synchronously inside an effect body (eslint rule).
            rafRef.current = requestAnimationFrame(() => {
                setAnimated(next);
                rafRef.current = null;
            });

            return () => {
                if (rafRef.current !== null) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
            };
        }

        const from = valueRef.current;
        const to = { gaugePercent: targetGaugePercent, remainingAbs: targetRemainingAbs };
        if (from.gaugePercent === to.gaugePercent && from.remainingAbs === to.remainingAbs) {
            return () => {};
        }

        const start = performance.now();

        const tick = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / LOG_SUMMARY_TWEEN_DURATION_MS);
            const eased = 1 - Math.pow(1 - t, 3);

            const next = {
                gaugePercent: from.gaugePercent + (to.gaugePercent - from.gaugePercent) * eased,
                remainingAbs: from.remainingAbs + (to.remainingAbs - from.remainingAbs) * eased
            };

            valueRef.current = next;
            setAnimated(next);

            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [args.disabled, gaugePercentTarget, remainingAbsTarget]);

    return {
        gaugeValue: Math.max(0, Math.min(animated.gaugePercent, 1)) * args.gaugeMax,
        remainingCaloriesLabel: remainingAbsTarget === null ? null : Math.round(Math.max(animated.remainingAbs, 0))
    };
}

export type LogSummaryCardProps = {
    /**
     * When true, the card behaves like the dashboard version: it is clickable (navigates to `/log`)
     * and includes a call-to-action line.
     */
    dashboardMode?: boolean;
    /**
     * Local date string (`YYYY-MM-DD`) used to fetch and display the log summary.
     * Defaults to the user's local "today" (based on their profile timezone when available).
     */
    date?: string;
};

/**
 * LogSummaryCard shows the daily calorie balance with optional dashboard CTA behavior.
 */
const LogSummaryCard: React.FC<LogSummaryCardProps> = ({ dashboardMode = false, date }) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const gaugeDimensions = isXs ? GAUGE_DIMENSIONS_COMPACT : GAUGE_DIMENSIONS_DEFAULT;
    const layoutGap = isXs ? LOG_SUMMARY_LAYOUT_GAP.compact : LOG_SUMMARY_LAYOUT_GAP.default;
    const remainingValueVariant = isXs ? LOG_SUMMARY_VALUE_VARIANT.compact : LOG_SUMMARY_VALUE_VARIANT.default;
    const timeZone = React.useMemo(() => {
        return user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }, [user?.timezone]);
    const today = React.useMemo(() => formatDateToLocalDateString(new Date(), timeZone), [timeZone]);
    const activeDate = date ?? today;
    const isActiveDateToday = activeDate === today;
    const title = React.useMemo(() => {
        const birthdayEmoji = getBirthdayEmojiForIsoDate(activeDate, user?.date_of_birth);
        const holidayEmoji = getHolidayEmojiForIsoDate(activeDate);
        const titleEmojis = [birthdayEmoji, holidayEmoji].filter(Boolean).join(' ');
        const titleEmojiSuffix = titleEmojis ? ` ${titleEmojis}` : '';

        const baseTitle = isActiveDateToday
            ? t('logSummary.title.today')
            : t('logSummary.title.forDate', { date: formatIsoDateForDisplay(activeDate) });

        return `${baseTitle}${titleEmojiSuffix}`;
    }, [activeDate, isActiveDateToday, t, user?.date_of_birth]);

    const foodQuery = useFoodLogQuery(activeDate);

    const profileSummaryQuery = useUserProfileQuery();

    const logs = foodQuery.data;
    const totalCalories = React.useMemo(() => {
        return (logs ?? []).reduce((acc, log) => acc + log.calories, 0);
    }, [logs]);
    const dailyTarget = profileSummaryQuery.data?.calorieSummary?.dailyCalorieTarget;
    const remainingCalories = typeof dailyTarget === 'number' ? Math.round(dailyTarget - totalCalories) : null;
    const isOver = dailyTarget !== undefined && dailyTarget !== null && totalCalories > dailyTarget;
    const gaugeValue = dailyTarget ? (isOver ? dailyTarget : Math.max(totalCalories, 0)) : 0;
    const gaugeMax = dailyTarget ? (isOver ? totalCalories : dailyTarget) : 1;

    const isLoading = foodQuery.isLoading || profileSummaryQuery.isLoading;
    const isError = foodQuery.isError || profileSummaryQuery.isError;

    const prefersReducedMotion = usePrefersReducedMotion();
    // The dashboard card is visible on the landing page where scroll smoothness matters most,
    // especially on lower-powered mobile devices. Keep it static; reserve the tween for /log date navigation.
    const animationsDisabled = prefersReducedMotion || isLoading || isError || dashboardMode;

    const animatedValues = useAnimatedLogSummaryValues({
        gaugeValue,
        gaugeMax,
        remainingCalories,
        disabled: animationsDisabled
    });

    const displayedGaugeValue = animationsDisabled ? gaugeValue : animatedValues.gaugeValue;
    let displayedRemainingCaloriesLabel: number | null = null;
    if (remainingCalories !== null) {
        displayedRemainingCaloriesLabel = animationsDisabled
            ? Math.abs(remainingCalories)
            : (animatedValues.remainingCaloriesLabel ?? 0);
    }

    // Split conditional branches into named nodes to keep the render tree readable.
    let cardBody: React.ReactNode;
    if (isLoading) {
        cardBody = (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: layoutGap,
                    flexDirection: 'row',
                    flexWrap: 'nowrap'
                }}
            >
                <Gauge
                    width={gaugeDimensions.width}
                    height={gaugeDimensions.height}
                    startAngle={GAUGE_START_ANGLE}
                    endAngle={GAUGE_END_ANGLE}
                    value={0}
                    valueMin={0}
                    valueMax={1}
                    innerRadius={GAUGE_INNER_RADIUS}
                    outerRadius={GAUGE_OUTER_RADIUS}
                    text={() => null}
                    sx={{
                        // Hint the browser to treat the gauge as an isolated paint region to keep scroll smooth on mobile.
                        // `transform` promotes the gauge into its own composited layer in many browsers, avoiding repaints while scrolling.
                        contain: 'paint',
                        willChange: 'transform',
                        transform: 'translateZ(0)',
                        flexShrink: 0,
                        '& .MuiGauge-referenceArc': {
                            fill: (theme) => theme.palette.grey[300]
                        },
                        '& .MuiGauge-valueArc': {
                            fill: (theme) => theme.palette.grey[200]
                        }
                    }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1">{t('logSummary.caloriesRemaining')}</Typography>
                    <Skeleton width="40%" height={SUMMARY_SKELETON_VALUE_HEIGHT} />
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t('logSummary.loggedLabel')}
                        </Typography>
                        <Skeleton width="55%" height={20} />
                    </Box>
                    {dashboardMode && (
                        <Typography variant="body2" color="primary">
                            {isActiveDateToday ? t('logSummary.cta.viewEditToday') : t('logSummary.cta.viewEditThis')}
                        </Typography>
                    )}
                </Box>
            </Box>
        );
    } else if (isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    {t('logSummary.error.unableToLoad')}
                </Typography>
                {dashboardMode && (
                    <Typography variant="body2" color="primary">
                        {isActiveDateToday ? t('logSummary.cta.viewEditToday') : t('logSummary.cta.viewEditThis')}
                    </Typography>
                )}
            </Box>
        );
    } else {
        const loggedLine = dailyTarget
            ? t('logSummary.loggedLine.ofTarget', { total: totalCalories, target: Math.round(dailyTarget) })
            : t('logSummary.loggedLine', { total: totalCalories });

        cardBody = (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: layoutGap,
                    flexDirection: 'row',
                    flexWrap: 'nowrap'
                }}
            >
                <Gauge
                    width={gaugeDimensions.width}
                    height={gaugeDimensions.height}
                    startAngle={GAUGE_START_ANGLE}
                    endAngle={GAUGE_END_ANGLE}
                    value={displayedGaugeValue}
                    valueMin={0}
                    valueMax={gaugeMax}
                    innerRadius={GAUGE_INNER_RADIUS}
                    outerRadius={GAUGE_OUTER_RADIUS}
                    text={() => null}
                    sx={{
                        // Hint the browser to treat the gauge as an isolated paint region to keep scroll smooth on mobile.
                        // `transform` promotes the gauge into its own composited layer in many browsers, avoiding repaints while scrolling.
                        contain: 'paint',
                        willChange: 'transform',
                        transform: 'translateZ(0)',
                        flexShrink: 0,
                        '& .MuiGauge-referenceArc': {
                            fill: (theme) => (isOver ? theme.palette.error.main : theme.palette.grey[300])
                        },
                        '& .MuiGauge-valueArc': {
                            fill: (theme) => theme.palette.primary.main
                        }
                    }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1">
                        {remainingCalories !== null && remainingCalories < 0
                            ? t('logSummary.caloriesOverBudget')
                            : t('logSummary.caloriesRemaining')}
                    </Typography>
                    <Typography variant={remainingValueVariant}>
                        {displayedRemainingCaloriesLabel !== null
                            ? t('logSummary.caloriesValue', { value: displayedRemainingCaloriesLabel })
                            : '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {loggedLine}
                    </Typography>
                    {dashboardMode && (
                        <Typography variant="body2" color="primary">
                            {isActiveDateToday ? t('logSummary.cta.viewEditToday') : t('logSummary.cta.viewEditThis')}
                        </Typography>
                    )}
                </Box>
            </Box>
        );
    }

    const content = (
        <CardContent
            sx={{
                p: LOG_SUMMARY_CARD_PADDING_SPACING,
                '&:last-child': { pb: LOG_SUMMARY_CARD_PADDING_SPACING }
            }}
        >
            <Typography variant="h6" sx={{ mb: LOG_SUMMARY_TITLE_MARGIN_BOTTOM_SPACING }}>
                {title}
            </Typography>
            {cardBody}
        </CardContent>
    );

    return (
        <Card
            sx={{
                height: '100%',
                width: '100%',
                ...(dashboardMode
                    ? {
                        transition: 'transform 120ms ease',
                        '&:hover': { transform: 'translateY(-2px)' }
                    }
                    : null)
            }}
        >
            {dashboardMode ? (
                <CardActionArea component={RouterLink} to="/log" sx={{ height: '100%' }}>
                    {content}
                </CardActionArea>
            ) : (
                content
            )}
        </Card>
    );
};

export default LogSummaryCard;
