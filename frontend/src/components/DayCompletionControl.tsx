import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import { useQueryClient } from '@tanstack/react-query';
import { alpha } from '@mui/material/styles';
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

const COMPLETION_CONTROL_ICON_SIZE_PX = 38; // Status icon tile size for the full-width day completion control.

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
    const StatusIcon = isComplete ? CheckCircleRoundedIcon : RadioButtonUncheckedRoundedIcon;

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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                        <Box
                            aria-hidden
                            sx={{
                                width: COMPLETION_CONTROL_ICON_SIZE_PX,
                                height: COMPLETION_CONTROL_ICON_SIZE_PX,
                                borderRadius: 2,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                                color: isComplete ? 'success.main' : 'text.secondary',
                                bgcolor: (theme) =>
                                    alpha(
                                        isComplete ? theme.palette.success.main : theme.palette.text.primary,
                                        theme.palette.mode === 'dark' ? 0.16 : 0.08
                                    )
                            }}
                        >
                            {isBusy ? <CircularProgress size={20} /> : <StatusIcon fontSize="small" />}
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                                    {t('today.completion.title')}
                                </Typography>
                                <Chip
                                    size="small"
                                    color={isComplete ? 'success' : 'default'}
                                    variant="outlined"
                                    label={
                                        isComplete
                                            ? t('today.completion.status.complete')
                                            : t('today.completion.status.incomplete')
                                    }
                                />
                            </Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {isComplete
                                    ? t('today.completion.helper.complete')
                                    : t('today.completion.helper.incomplete')}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant={isComplete ? 'outlined' : 'contained'}
                        color={isComplete ? 'inherit' : 'primary'}
                        startIcon={
                            isBusy ? (
                                <CircularProgress size={16} color="inherit" />
                            ) : isComplete ? (
                                <LockOpenRoundedIcon />
                            ) : (
                                <CheckCircleRoundedIcon />
                            )
                        }
                        onClick={() => void handleToggleComplete()}
                        disabled={isBusy || completionQuery.isError}
                        aria-pressed={isComplete}
                        sx={{ flexShrink: 0 }}
                    >
                        {isBusy
                            ? t('common.loading')
                            : isComplete
                            ? t('today.completion.markIncomplete')
                            : t('today.completion.markComplete')}
                    </Button>
                </Box>

                {completionQuery.isError && <Alert severity="warning">{t('today.completion.error')}</Alert>}
                {completionMutation.isError && <Alert severity="warning">{t('today.completion.saveError')}</Alert>}
            </Stack>
        </AppCard>
    );
};

export default DayCompletionControl;
