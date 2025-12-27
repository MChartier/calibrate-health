import React, { useMemo } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { getTodayIsoDate } from '../utils/date';
import { parseDateOnlyToLocalDate } from '../utils/goalTracking';
import SectionHeader from '../ui/SectionHeader';

const EM_DASH = '\u2014';

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

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
 * Extract the date-only portion of a timestamp-like string (e.g. "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SSZ").
 */
function toDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

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
 * Return the most recent metric on-or-before a given local date string (`YYYY-MM-DD`).
 *
 * This prevents "future" weights from showing when reviewing past logs, while still keeping
 * the card informative when there is no exact weigh-in for the selected day.
 */
function findMetricOnOrBeforeDate(metrics: MetricEntry[], targetDate: string): MetricEntry | null {
    for (const metric of metrics) {
        const metricDate = toDatePart(metric.date);
        if (metricDate <= targetDate) return metric;
    }
    return null;
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

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? (res.data as MetricEntry[]) : [];
        }
    });

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);

    const metricForSelectedDate = useMemo(() => {
        return metrics.find((metric) => toDatePart(metric.date) === date) ?? null;
    }, [date, metrics]);

    const displayedMetric = useMemo(() => {
        if (metricForSelectedDate) return metricForSelectedDate;
        return findMetricOnOrBeforeDate(metrics, date);
    }, [date, metricForSelectedDate, metrics]);

    const ctaLabel = useMemo(() => {
        if (isToday) {
            return metricForSelectedDate ? "Edit today's weight" : "Log today's weight";
        }
        return metricForSelectedDate ? 'Edit weight' : 'Log weight';
    }, [isToday, metricForSelectedDate]);

    const displayedWeightLabel = displayedMetric ? `${displayedMetric.weight.toFixed(1)} ${unitLabel}` : EM_DASH;
    const asOfLabel = formatMetricDateLabel(displayedMetric?.date ?? null);

    let cardBody: React.ReactNode;
    if (metricsQuery.isLoading) {
        cardBody = (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' }
                }}
            >
                <Skeleton variant="rounded" width={56} height={56} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
                    <Skeleton width="40%" height={32} />
                    <Skeleton width="55%" />
                    <Skeleton width="35%" />
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
                            width: 56,
                            height: 56,
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
