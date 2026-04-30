import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import { useQueryClient } from '@tanstack/react-query';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';
import {
    foodLogDayQueryKey,
    foodLogDayRangeQueryKeyPrefix,
    useFoodLogDayMutation,
    useFoodLogDayQuery
} from '../queries/foodLogDay';

export type DayCompletionControlProps = {
    date: string;
};

const DAY_COMPLETION_ACTION_WIDTH = { xs: '100%', sm: 'auto' }; // Full-width on phones so the action reads as a clear row CTA.

/**
 * Full-width completion state for the selected local day.
 *
 * Marking the day complete intentionally locks day-specific edits elsewhere on the Today screen.
 */
const DayCompletionControl: React.FC<DayCompletionControlProps> = ({ date }) => {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const completionQuery = useFoodLogDayQuery(date);
    const completionMutation = useFoodLogDayMutation();
    const isComplete = Boolean(completionQuery.data?.is_complete);
    const isBusy = completionQuery.isLoading || completionMutation.isPending;
    const nextIsComplete = !isComplete;
    const completedStatusLabel = t('today.completion.status.complete');

    let actionLabel = isComplete ? t('today.completion.markIncomplete') : t('today.completion.markComplete');
    let actionIcon: React.ReactNode = isComplete ? <LockOpenRoundedIcon /> : null;
    if (isBusy) {
        actionLabel = t('common.loading');
        actionIcon = <CircularProgress size={16} color="inherit" />;
    }

    const handleToggleComplete = async () => {
        try {
            await completionMutation.mutateAsync({ date, is_complete: nextIsComplete });
            await queryClient.invalidateQueries({ queryKey: foodLogDayQueryKey(date) });
            await queryClient.invalidateQueries({ queryKey: foodLogDayRangeQueryKeyPrefix() });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <AppCard
            contentSx={{
                p: { xs: 1.25, sm: 1.5 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.5 } }
            }}
        >
            <Stack spacing={1}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: { xs: 'stretch', sm: 'center' },
                        justifyContent: 'space-between',
                        gap: { xs: 1.25, sm: 1.5 },
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                                {t('today.completion.title')}
                            </Typography>
                            {isComplete ? <Chip size="small" color="success" variant="outlined" label={completedStatusLabel} /> : null}
                        </Box>
                    </Box>

                    <Button
                        variant="outlined"
                        color={isComplete ? 'inherit' : 'primary'}
                        startIcon={actionIcon}
                        onClick={() => void handleToggleComplete()}
                        disabled={isBusy || completionQuery.isError}
                        aria-pressed={isComplete}
                        sx={{ flexShrink: 0, width: DAY_COMPLETION_ACTION_WIDTH }}
                    >
                        {actionLabel}
                    </Button>
                </Box>

                {completionQuery.isError && <Alert severity="warning">{t('today.completion.error')}</Alert>}
                {completionMutation.isError && <Alert severity="warning">{t('today.completion.saveError')}</Alert>}
            </Stack>
        </AppCard>
    );
};

export default DayCompletionControl;
