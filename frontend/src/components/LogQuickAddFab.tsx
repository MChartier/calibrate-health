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
import type { QuickAddDialogs } from '../hooks/useQuickAddDialogs';
import {
    QUICK_ADD_FAB_BOTTOM_NAV_GAP_SPACING,
    QUICK_ADD_FAB_EDGE_OFFSET_SPACING
} from '../constants/quickAddFab';
import { useI18n } from '../i18n/useI18n';
import { formatIsoDateForDisplay } from '../utils/date';

type LogQuickAddFabProps = {
    date: string;
    dialogs: QuickAddDialogs;
};

/**
 * LogQuickAddFab
 *
 * Floating speed dial that opens food and weight log dialogs for the supplied local date.
 */
const LogQuickAddFab: React.FC<LogQuickAddFabProps> = ({ date, dialogs }) => {
    const queryClient = useQueryClient();
    const theme = useTheme();
    const { t } = useI18n();
    const isFoodDialogFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const dateLabel = useMemo(() => formatIsoDateForDisplay(date), [date]);

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
                    onClick={dialogs.openFoodDialog}
                />
                <SpeedDialAction
                    key="add-weight"
                    icon={<MonitorWeightIcon />}
                    tooltipTitle={t('log.speedDial.addWeight')}
                    onClick={dialogs.openWeightDialog}
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
                        dialogs.closeFoodDialog();
                    }}
                />
            </Dialog>

            <Dialog open={dialogs.isWeightDialogOpen} onClose={dialogs.closeWeightDialog} fullWidth maxWidth="sm">
                <DialogTitle sx={{ position: 'relative', pr: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box component="span">{t('log.dialog.trackWeight')}</Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {t('log.dialog.trackWeight.subtitle', { date: dateLabel })}
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
                    date={date}
                    onSuccess={() => {
                        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
                        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
                        void queryClient.invalidateQueries({ queryKey: ['profile'] });
                        dialogs.closeWeightDialog();
                    }}
                />
            </Dialog>
        </>
    );
};

export default LogQuickAddFab;
