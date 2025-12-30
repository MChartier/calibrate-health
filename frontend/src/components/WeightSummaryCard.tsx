import React, { useMemo } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { getTodayIsoDate } from '../utils/date';
import { parseDateOnlyToLocalDate } from '../utils/goalTracking';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import SectionHeader from '../ui/SectionHeader';
import { findMetricOnOrBeforeDate, toDatePart, useMetricsQuery } from '../queries/metrics';

const EM_DASH = '\u2014';
// Duration used for "date switch" value transitions.
const WEIGHT_SUMMARY_TWEEN_DURATION_MS = 520;
// Icon tile size for the weight card (kept consistent between loading + loaded UI).
const WEIGHT_ICON_TILE_SIZE_PX = 56;

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
            return metricForSelectedDate ? "Edit today's weight" : "Log today's weight";
        }
        return metricForSelectedDate ? 'Edit weight' : 'Log weight';
    }, [isToday, metricForSelectedDate]);

    const displayedWeightLabel = displayedWeight !== null ? `${animatedWeight.toFixed(1)} ${unitLabel}` : EM_DASH;
    const asOfLabel = formatMetricDateLabel(displayedMetric?.date ?? null);

    let cardBody: React.ReactNode;
    if (metricsQuery.isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Box
                        sx={{
                            width: WEIGHT_ICON_TILE_SIZE_PX,
                            height: WEIGHT_ICON_TILE_SIZE_PX,
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
                                As of
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
                <Alert severity="warning">Unable to load your weight history right now.</Alert>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="outlined" onClick={onOpenWeightEntry}>
                        {ctaLabel}
                    </Button>
                </Box>
            </Box>
        );
    } else {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Box
                        sx={{
                            width: WEIGHT_ICON_TILE_SIZE_PX,
                            height: WEIGHT_ICON_TILE_SIZE_PX,
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
                            As of {asOfLabel}
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
                    title="Weight"
                    align="center"
                    actions={
                        isToday && !metricsQuery.isLoading && !metricsQuery.isError ? (
                            <Chip
                                size="small"
                                color={metricForSelectedDate ? 'success' : 'warning'}
                                variant="outlined"
                                label={metricForSelectedDate ? 'Done for today' : 'Due today'}
                            />
                        ) : null
                    }
                />

                <Box sx={{ mt: 1.5 }}>{cardBody}</Box>
            </CardContent>
        </Card>
    );
};

export default WeightSummaryCard;
