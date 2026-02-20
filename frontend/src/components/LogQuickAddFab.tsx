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
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import AddIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import RestaurantIcon from '@mui/icons-material/RestaurantRounded';
import { useQueryClient } from '@tanstack/react-query';
import FoodEntryForm from './FoodEntryForm';
import WeightEntryForm from './WeightEntryForm';
import {
    QUICK_ADD_FAB_BOTTOM_NAV_GAP_SPACING,
    QUICK_ADD_FAB_EDGE_OFFSET_SPACING
} from '../constants/quickAddFab';
import { useAuth } from '../context/useAuth';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useI18n } from '../i18n/useI18n';
import { inAppNotificationsQueryKey } from '../queries/inAppNotifications';
import { haptic } from '../utils/haptics';
import { formatIsoDateForDisplay, getTodayIsoDate } from '../utils/date';

/**
 * Floating action button for adding food or weight logs from the log view.
 */
type LogQuickAddFabProps = {
    date: string;
};

/**
 * LogQuickAddFab
 *
 * Floating speed dial that opens food and weight dialogs.
 *
 * Note: food entries target the currently viewed log day; weight entries from the FAB always target today.
 */
const LogQuickAddFab: React.FC<LogQuickAddFabProps> = ({ date }) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { dialogs, openWeightDialogFromFab, weightDialogDateMode } = useQuickAddFab();
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
            <SpeedDial
                ariaLabel={t('log.speedDial.aria')}
                icon={<AddIcon />}
                sx={(theme) => ({
                    position: 'fixed',
                    right: theme.spacing(QUICK_ADD_FAB_EDGE_OFFSET_SPACING),
                    bottom: {
                        xs: `calc(${theme.custom.layout.page.paddingBottomWithBottomNav} + ${theme.spacing(QUICK_ADD_FAB_BOTTOM_NAV_GAP_SPACING)})`,
                        md: theme.spacing(QUICK_ADD_FAB_EDGE_OFFSET_SPACING)
                    }
                })}
            >
                <SpeedDialAction
                    key="add-food"
                    icon={<RestaurantIcon />}
                    tooltipTitle={t('log.speedDial.addFood')}
                    onClick={() => {
                        haptic.tap();
                        dialogs.openFoodDialog();
                    }}
                />
                <SpeedDialAction
                    key="add-weight"
                    icon={<MonitorWeightIcon />}
                    tooltipTitle={t('log.speedDial.addWeight')}
                    onClick={() => {
                        haptic.tap();
                        openWeightDialogFromFab();
                    }}
                />
            </SpeedDial>

            <Dialog
                open={dialogs.isFoodDialogOpen}
                onClose={dialogs.closeFoodDialog}
                fullScreen={isFoodDialogFullScreen}
                fullWidth={!isFoodDialogFullScreen}
                maxWidth={isFoodDialogFullScreen ? false : 'sm'}
                scroll="paper"
                PaperProps={{
                    sx: {
                        height: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                        maxHeight: isFoodDialogFullScreen ? '100dvh' : 'min(90dvh, 860px)',
                        m: isFoodDialogFullScreen ? 0 : 2,
                        borderRadius: isFoodDialogFullScreen ? 0 : 2,
                        display: 'flex',
                        flexDirection: 'column'
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
                    onSuccess={() => {
                        void queryClient.invalidateQueries({ queryKey: ['food'] });
                        void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
                        dialogs.closeFoodDialog();
                    }}
                />
            </Dialog>

            <Dialog open={dialogs.isWeightDialogOpen} onClose={dialogs.closeWeightDialog} fullWidth maxWidth="sm">
                <DialogTitle sx={{ position: 'relative', pr: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box component="span">{t('log.dialog.trackWeight')}</Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
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
