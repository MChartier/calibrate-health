import React, { useMemo } from 'react';
import {
    Box,
    Dialog,
    DialogTitle,
    IconButton,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseRounded';
import { useQueryClient } from '@tanstack/react-query';
import FoodEntryForm from './FoodEntryForm';
import WeightEntryForm from './WeightEntryForm';
import { useAuth } from '../context/useAuth';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useI18n } from '../i18n/useI18n';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';
import { formatIsoDateForDisplay, getTodayIsoDate } from '../utils/date';

/**
 * Shared add/edit dialogs for daily food and weight logging.
 */
type LogQuickAddFabProps = {
    date: string;
};

/**
 * Food entries target the currently viewed log day; weight entries use the caller's selected date mode.
 */
const LogQuickAddFab: React.FC<LogQuickAddFabProps> = ({ date }) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { dialogs, weightDialogDateMode } = useQuickAddFab();
    const theme = useTheme();
    const { t } = useI18n();
    const isFoodDialogFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const todayIso = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    const weightEntryDate = weightDialogDateMode === 'today' ? todayIso : date;
    const weightDateLabel = useMemo(() => formatIsoDateForDisplay(weightEntryDate), [weightEntryDate]);
    const showTodaySubtitle = weightEntryDate === todayIso;
    const subtitleKey = showTodaySubtitle
        ? 'log.dialog.trackWeight.subtitleToday'
        : 'log.dialog.trackWeight.subtitle';

    return (
        <>
            <Dialog
                open={dialogs.isFoodDialogOpen}
                onClose={dialogs.closeFoodDialog}
                fullScreen={isFoodDialogFullScreen}
                fullWidth={!isFoodDialogFullScreen}
                maxWidth={isFoodDialogFullScreen ? false : 'sm'}
                scroll="paper"
                slotProps={{
                    paper: {
                        sx: {
                            height: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                            maxHeight: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                            m: isFoodDialogFullScreen ? 0 : 2,
                            borderRadius: isFoodDialogFullScreen ? 0 : 2,
                            display: 'flex',
                            flexDirection: 'column'
                        }
                    }
                }}
            >
                <DialogTitle sx={{ position: 'relative', pr: 6 }}>
                    {t('log.dialog.trackFood')}
                    <Tooltip title={t('common.close')}>
                        <IconButton
                            aria-label={t('common.close')}
                            onClick={dialogs.closeFoodDialog}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <FoodEntryForm
                    date={date}
                    initialMealPeriod={dialogs.foodDialogMealPeriod}
                    onSuccess={(result) => {
                        void queryClient.invalidateQueries({ queryKey: ['food'] });
                        void queryClient.invalidateQueries({ queryKey: ['recent-foods'] });
                        void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
                        if (result?.closeDialog !== false) {
                            dialogs.closeFoodDialog();
                        }
                    }}
                />
            </Dialog>
            <Dialog open={dialogs.isWeightDialogOpen} onClose={dialogs.closeWeightDialog} fullWidth maxWidth="sm">
                <DialogTitle sx={{ position: 'relative', pr: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box component="span">{t('log.dialog.trackWeight')}</Box>
                        <Typography
                            variant="body2"
                            sx={{
                                color: "text.secondary",
                                mt: 0.25
                            }}>
                            {t(subtitleKey, { date: weightDateLabel })}
                        </Typography>
                    </Box>

                    <Tooltip title={t('common.close')}>
                        <IconButton
                            aria-label={t('common.close')}
                            onClick={dialogs.closeWeightDialog}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <WeightEntryForm
                    date={weightEntryDate}
                    onSuccess={() => {
                        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
                        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
                        void queryClient.invalidateQueries({ queryKey: ['profile'] });
                        void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
                        dialogs.closeWeightDialog();
                    }}
                />
            </Dialog>
        </>
    );
};

export default LogQuickAddFab;
