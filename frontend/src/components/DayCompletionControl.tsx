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
const DAY_COMPLETION_CARD_COMPLETE_BG_ALPHA = { light: 0.08, dark: 0.16 } as const; // Success tint marks a completed day without overpowering the row.
const DAY_COMPLETION_CARD_COMPLETE_BORDER_ALPHA = { light: 0.28, dark: 0.38 } as const; // Border tint makes the completed card read as selected.
const DAY_COMPLETION_CARD_COMPLETE_HOVER_BG_ALPHA = { light: 0.12, dark: 0.22 } as const; // Slightly stronger tint confirms the full card is clickable.
const DAY_COMPLETION_CARD_FOCUS_RING_WIDTH_PX = 2; // The hidden full-card input needs a visible keyboard focus target.
const DAY_COMPLETION_CARD_FOCUS_RING_OFFSET_PX = 2; // Keep the focus ring outside the card border so content does not shift.
const DAY_COMPLETION_CARD_FOCUS_RING_ALPHA = 0.48; // Match MUI focus visibility without creating a heavy outline.
const DAY_COMPLETION_CARD_CONTENT_Z_INDEX = 1; // Visible content stays above the card surface while the input owns the hit target.
const DAY_COMPLETION_CARD_INPUT_Z_INDEX = 2; // The transparent input covers the card so any click/tap toggles the day state.
const DAY_COMPLETION_SWITCH_OFF_TRACK_ALPHA = 0.24; // Off-state track contrast keeps the toggle visible on white cards.
const DAY_COMPLETION_SWITCH_OFF_BORDER_ALPHA = 0.38; // Border separates the off-state track from the card background.

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
    const isToggleDisabled = isBusy || completionQuery.isError;
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

    const handleCompletionInputChange = () => {
        if (isToggleDisabled) return;
        void handleToggleComplete(!isComplete);
    };

    return (
        <AppCard
            sx={(theme) => {
                const colorMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
                return {
                    position: 'relative',
                    cursor: isToggleDisabled ? 'default' : 'pointer',
                    ...(isComplete
                        ? {
                            bgcolor: alpha(theme.palette.success.main, DAY_COMPLETION_CARD_COMPLETE_BG_ALPHA[colorMode]),
                            borderColor: alpha(
                                theme.palette.success.main,
                                DAY_COMPLETION_CARD_COMPLETE_BORDER_ALPHA[colorMode]
                            )
                        }
                        : null),
                    ...(!isToggleDisabled
                        ? {
                            '&:hover': {
                                bgcolor: isComplete
                                    ? alpha(
                                        theme.palette.success.main,
                                        DAY_COMPLETION_CARD_COMPLETE_HOVER_BG_ALPHA[colorMode]
                                    )
                                    : theme.palette.action.hover
                            },
                            '&:focus-within': {
                                outline: `${DAY_COMPLETION_CARD_FOCUS_RING_WIDTH_PX}px solid ${alpha(
                                    theme.palette.primary.main,
                                    DAY_COMPLETION_CARD_FOCUS_RING_ALPHA
                                )}`,
                                outlineOffset: DAY_COMPLETION_CARD_FOCUS_RING_OFFSET_PX
                            }
                        }
                        : null)
                };
            }}
            contentSx={{
                p: { xs: 1.25, sm: 1.5 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.5 } }
            }}
        >
            <Box
                component="input"
                type="checkbox"
                role="switch"
                aria-label={toggleLabel}
                checked={isComplete}
                disabled={isToggleDisabled}
                onChange={handleCompletionInputChange}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: DAY_COMPLETION_CARD_INPUT_Z_INDEX,
                    width: '100%',
                    height: '100%',
                    m: 0,
                    cursor: 'inherit',
                    opacity: 0
                }}
            />
            <Stack spacing={1} sx={{ position: 'relative', zIndex: DAY_COMPLETION_CARD_CONTENT_Z_INDEX }}>
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
                        disabled={isToggleDisabled}
                        color="success"
                        slotProps={{ input: { 'aria-hidden': true, readOnly: true, tabIndex: -1 } }}
                        sx={(theme) => ({
                            '& .MuiSwitch-switchBase': {
                                color: isComplete ? theme.palette.common.white : theme.palette.text.secondary,
                                '&.Mui-checked': {
                                    color: theme.palette.common.white,
                                    '& + .MuiSwitch-track': {
                                        opacity: 1,
                                        backgroundColor: theme.palette.success.main,
                                        borderColor: theme.palette.success.dark
                                    }
                                },
                                '&.Mui-disabled': {
                                    color: isComplete
                                        ? alpha(theme.palette.common.white, 0.8)
                                        : alpha(theme.palette.text.primary, 0.42)
                                },
                                '&.Mui-disabled + .MuiSwitch-track': {
                                    opacity: 1
                                }
                            },
                            '& .MuiSwitch-track': {
                                opacity: 1,
                                backgroundColor: alpha(theme.palette.text.primary, DAY_COMPLETION_SWITCH_OFF_TRACK_ALPHA),
                                border: `1px solid ${alpha(theme.palette.text.primary, DAY_COMPLETION_SWITCH_OFF_BORDER_ALPHA)}`
                            }
                        })}
                    />
                </Box>

                {completionQuery.isError && <Alert severity="warning">{t('today.completion.error')}</Alert>}
                {completionMutation.isError && <Alert severity="warning">{t('today.completion.saveError')}</Alert>}
            </Stack>
        </AppCard>
    );
};

export default DayCompletionControl;
