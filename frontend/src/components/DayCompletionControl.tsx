import React from 'react';
import { Alert, Box, Stack, Switch, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
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

const DAY_COMPLETION_STATUS_ICON_SIZE_PX = 28; // The icon is large enough to read as state without competing with the switch.

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
    const toggleLabel = isComplete ? t('today.completion.markIncomplete') : t('today.completion.markComplete');

    const handleToggleComplete = async (nextIsComplete: boolean) => {
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
                        bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.08),
                        borderColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.38 : 0.28)
                    }
                    : null
            }
            contentSx={{
                p: { xs: 1.25, sm: 1.5 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.5 } }
            }}
        >
            <Stack spacing={1}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                    }}
                >
                    <Box
                        sx={{
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                        }}
                    >
                        <CheckCircleRoundedIcon
                            aria-hidden
                            sx={{
                                flexShrink: 0,
                                fontSize: DAY_COMPLETION_STATUS_ICON_SIZE_PX,
                                color: isComplete ? 'success.main' : 'action.disabled'
                            }}
                        />
                        <Typography variant="subtitle1" sx={{ fontWeight: 850 }}>
                            {t('today.completion.title')}
                        </Typography>
                    </Box>

                    <Switch
                        checked={isComplete}
                        onChange={(_event, checked) => void handleToggleComplete(checked)}
                        disabled={isBusy || completionQuery.isError}
                        color="success"
                        slotProps={{ input: { 'aria-label': toggleLabel } }}
                    />
                </Box>

                {completionQuery.isError && <Alert severity="warning">{t('today.completion.error')}</Alert>}
                {completionMutation.isError && <Alert severity="warning">{t('today.completion.saveError')}</Alert>}
            </Stack>
        </AppCard>
    );
};

export default DayCompletionControl;
