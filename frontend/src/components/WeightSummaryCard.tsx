import React, { useMemo } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography, useMediaQuery } from '@mui/material';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { getTodayIsoDate } from '../utils/date';
import { parseDateOnlyToLocalDate } from '../utils/goalTracking';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import SectionHeader from '../ui/SectionHeader';
import { findMetricOnOrBeforeDate, toDatePart, useMetricsQuery } from '../queries/metrics';
import { useI18n } from '../i18n/useI18n';

/**
 * Log weight summary card with "as of" context and quick entry CTA.
 */
const EM_DASH = '\u2014';
// Duration used for "date switch" value transitions.
const WEIGHT_SUMMARY_TWEEN_DURATION_MS = 520;
const WEIGHT_ICON_TILE_SIZE_PX = { xs: 48, sm: 56 }; // Icon tile size shrinks slightly on xs to keep the row compact without hurting tap targets.
const WEIGHT_CARD_STACK_GAP = { xs: 1.25, sm: 1.5 }; // Vertical spacing between major rows within the card body.
const WEIGHT_CARD_ROW_GAP = { xs: 1.25, sm: 2 }; // Gap between the icon tile and the text column.
const WEIGHT_CARD_BODY_MARGIN_TOP = { xs: 1.25, sm: 1.5 }; // Space between the header and the card body content.

export type WeightSummaryCardProps = {
    /**
     * Local date string (`YYYY-MM-DD`) representing the log day currently being viewed.
     *
     * Used to compute the "today" state and determine which day's weight entry the CTA edits.
     */
    date: string;
    /**
     * Called when the user clicks the add/edit weight CTA button.
     *
     * The parent controls the actual modal dialog (WeightEntryForm), so this is just a trigger.
     */
    onOpenWeightEntry: () => void;
};

/**
 * Format a Postgres DATE-ish string for display, falling back to an em dash for invalid inputs.
 */
function formatMetricDateLabel(value: string | null): string {
    if (!value) return EM_DASH;
    const parsed = parseDateOnlyToLocalDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return EM_DASH;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

/**
 * WeightSummaryCard
 *
 * Dense weight summary card for the Log page.
 *
 * - Shows a large "current weight" value plus an "As of {date}" line to make recency obvious.
 * - When viewing today, surfaces a clear "Due today" / "Done for today" state and adjusts CTA text.
 */
const WeightSummaryCard: React.FC<WeightSummaryCardProps> = ({ date, onOpenWeightEntry }) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const iconTileSizePx = isXs ? WEIGHT_ICON_TILE_SIZE_PX.xs : WEIGHT_ICON_TILE_SIZE_PX.sm;
    const stackGap = isXs ? WEIGHT_CARD_STACK_GAP.xs : WEIGHT_CARD_STACK_GAP.sm;
    const rowGap = isXs ? WEIGHT_CARD_ROW_GAP.xs : WEIGHT_CARD_ROW_GAP.sm;
    const bodyMarginTop = isXs ? WEIGHT_CARD_BODY_MARGIN_TOP.xs : WEIGHT_CARD_BODY_MARGIN_TOP.sm;
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const today = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    const isToday = date === today;

    const metricsQuery = useMetricsQuery();

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);

    const metricForSelectedDate = useMemo(() => {
        return metrics.find((metric) => toDatePart(metric.date) === date) ?? null;
    }, [date, metrics]);

    const displayedMetric = useMemo(() => {
        if (metricForSelectedDate) return metricForSelectedDate;
        return findMetricOnOrBeforeDate(metrics, date);
    }, [date, metricForSelectedDate, metrics]);

    const prefersReducedMotion = usePrefersReducedMotion();
    const displayedWeight = displayedMetric?.weight ?? null;
    const animatedWeight = useTweenedNumber(displayedWeight ?? 0, {
        durationMs: WEIGHT_SUMMARY_TWEEN_DURATION_MS,
        disabled: prefersReducedMotion || metricsQuery.isLoading || metricsQuery.isError || displayedWeight === null
    });

    const ctaLabel = useMemo(() => {
        if (isToday) {
            return metricForSelectedDate ? t('weightSummary.cta.editToday') : t('weightSummary.cta.logToday');
        }
        return metricForSelectedDate ? t('weightSummary.cta.edit') : t('weightSummary.cta.log');
    }, [isToday, metricForSelectedDate, t]);

    const displayedWeightLabel = displayedWeight !== null ? `${animatedWeight.toFixed(1)} ${unitLabel}` : EM_DASH;
    const asOfLabel = formatMetricDateLabel(displayedMetric?.date ?? null);

    let cardBody: React.ReactNode;
    if (metricsQuery.isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: rowGap,
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Box
                        sx={{
                            width: iconTileSizePx,
                            height: iconTileSizePx,
                            borderRadius: 2,
                            backgroundColor: (theme) =>
                                alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        aria-hidden
                    >
                        <MonitorWeightIcon color="primary" />
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                        <Skeleton width="40%" height={32} />
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                            <Typography variant="body2" color="text.secondary">
                                {t('weightSummary.asOf')}
                            </Typography>
                            <Skeleton width="35%" height={20} />
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Skeleton variant="rounded" height={36} width={156} />
                </Box>
            </Box>
        );
    } else if (metricsQuery.isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Alert severity="warning">{t('weightSummary.error.unableToLoad')}</Alert>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="outlined" onClick={onOpenWeightEntry}>
                        {ctaLabel}
                    </Button>
                </Box>
            </Box>
        );
    } else {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: stackGap }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: rowGap,
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Box
                        sx={{
                            width: iconTileSizePx,
                            height: iconTileSizePx,
                            borderRadius: 2,
                            backgroundColor: (theme) =>
                                alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        aria-hidden
                    >
                        <MonitorWeightIcon color="primary" />
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="h5" sx={{ lineHeight: 1.1 }}>
                            {displayedWeightLabel}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('weightSummary.asOfWithDate', { date: asOfLabel })}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="outlined" onClick={onOpenWeightEntry}>
                        {ctaLabel}
                    </Button>
                </Box>
            </Box>
        );
    }

    return (
        <Card sx={{ height: '100%', width: '100%' }}>
            <CardContent>
                <SectionHeader
                    title={t('weightSummary.title')}
                    align="center"
                    actions={
                        isToday && !metricsQuery.isLoading && !metricsQuery.isError ? (
                            <Chip
                                size="small"
                                color={metricForSelectedDate ? 'success' : 'warning'}
                                variant="outlined"
                                label={
                                    metricForSelectedDate
                                        ? t('weightSummary.chip.doneToday')
                                        : t('weightSummary.chip.dueToday')
                                }
                            />
                        ) : null
                    }
                />

                <Box sx={{ mt: bodyMarginTop }}>{cardBody}</Box>
            </CardContent>
        </Card>
    );
};

export default WeightSummaryCard;
