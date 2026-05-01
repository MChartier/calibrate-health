import React from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
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

const DAY_COMPLETION_ACTION_WIDTH = '100%'; // Treat the status action as a full-row toggle instead of a small form control.

/**
 * Full-width completion state for the selected local day.
 *
 * Completion is a lightweight "done for now" marker; users can still add or edit logs afterward.
 */
const DayCompletionControl: React.FC<DayCompletionControlProps> = ({ date }) => {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const completionQuery = useFoodLogDayQuery(date);
    const completionMutation = useFoodLogDayMutation();
    const isComplete = Boolean(completionQuery.data?.is_complete);
    const isBusy = completionQuery.isLoading || completionMutation.isPending;
    const nextIsComplete = !isComplete;

    let actionLabel = isComplete ? t('today.completion.markIncomplete') : t('today.completion.markComplete');
    let actionIcon: React.ReactNode = undefined;
    if (isBusy) {
        actionLabel = t('common.loading');
        actionIcon = <CircularProgress size={16} color="inherit" />;
    }
    const statusLabel = isComplete ? t('today.completion.status.complete') : t('today.completion.status.incomplete');

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
            sx={(theme) =>
                isComplete
                    ? {
                        bgcolor: 'success.main',
                        color: 'success.contrastText',
                        borderColor: 'success.dark',
                        boxShadow: `0 12px 28px ${alpha(theme.palette.success.dark, theme.palette.mode === 'dark' ? 0.34 : 0.18)}`
                    }
                    : null
            }
            contentSx={{
                p: { xs: 1.25, sm: 1.5 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.5 } }
            }}
        >
            <Stack spacing={1.25}>
                <Box
                    sx={{
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.25
                    }}
                >
                    <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                        {t('today.completion.title')}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: isComplete ? 'inherit' : 'text.secondary',
                            opacity: isComplete ? 0.9 : 1
                        }}
                    >
                        {statusLabel}
                    </Typography>
                </Box>

                <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={actionIcon}
                    onClick={() => void handleToggleComplete()}
                    disabled={isBusy || completionQuery.isError}
                    aria-pressed={isComplete}
                    sx={(theme) => ({
                        width: DAY_COMPLETION_ACTION_WIDTH,
                        color: 'text.primary',
                        borderColor: alpha(theme.palette.text.primary, 0.24),
                        bgcolor: 'background.paper',
                        '&:hover': {
                            borderColor: alpha(theme.palette.text.primary, 0.44),
                            bgcolor: 'action.hover'
                        }
                    })}
                >
                    {actionLabel}
                </Button>

                {completionQuery.isError && <Alert severity="warning">{t('today.completion.error')}</Alert>}
                {completionMutation.isError && <Alert severity="warning">{t('today.completion.saveError')}</Alert>}
            </Stack>
        </AppCard>
    );
};

export default DayCompletionControl;
