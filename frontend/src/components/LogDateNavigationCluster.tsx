import React from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import TodayRoundedIcon from '@mui/icons-material/TodayRounded';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import { useI18n } from '../i18n/useI18n';
import { mergeSx } from '../ui/sx';
import LogDatePickerControl from './LogDatePickerControl';

type LogDateNavigationClusterProps = {
    navigation: LogDateNavigationState;
    showTodayShortcut?: boolean;
    sx?: SxProps<Theme>;
};

const DATE_CLUSTER_GAP_SPACING = 0.5; // Horizontal gap between date navigation controls.
const NAVBAR_DATE_CONTROL_WIDTH_PX = { xs: 136, sm: 188, md: 220 }; // Compact xs width keeps the date in the app bar after the wordmark collapses.
const NAVBAR_AUXILIARY_CONTROL_DISPLAY = { xs: 'none', sm: 'inline-flex' } as const; // xs app bars reserve the center slot for the date field itself.

/**
 * App-bar selected-day navigation controls.
 */
const LogDateNavigationCluster: React.FC<LogDateNavigationClusterProps> = ({
    navigation,
    showTodayShortcut = false,
    sx
}) => {
    const { t } = useI18n();

    return (
        <Box
            sx={mergeSx(
                {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: DATE_CLUSTER_GAP_SPACING,
                    minWidth: 0,
                    width: '100%'
                },
                sx
            )}
        >
            <Box component="span" sx={{ display: NAVBAR_AUXILIARY_CONTROL_DISPLAY }}>
                <Tooltip title={t('log.nav.prevDay')}>
                    <span>
                        <IconButton
                            size="small"
                            aria-label={t('log.nav.prevDay')}
                            onClick={navigation.goToPreviousDate}
                            disabled={!navigation.canGoBack}
                        >
                            <ChevronLeftRoundedIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ width: NAVBAR_DATE_CONTROL_WIDTH_PX, maxWidth: '100%' }}>
                <LogDatePickerControl
                    placement="navbar"
                    value={navigation.date}
                    ariaLabel={t('log.datePicker.aria', { date: navigation.dateLabel })}
                    min={navigation.minDate}
                    max={navigation.maxDate}
                    onChange={navigation.setDate}
                />
            </Box>

            <Box component="span" sx={{ display: NAVBAR_AUXILIARY_CONTROL_DISPLAY }}>
                <Tooltip title={t('log.nav.nextDay')}>
                    <span>
                        <IconButton
                            size="small"
                            aria-label={t('log.nav.nextDay')}
                            onClick={navigation.goToNextDate}
                            disabled={!navigation.canGoForward}
                        >
                            <ChevronRightRoundedIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            {showTodayShortcut && (
                <Box component="span" sx={{ display: NAVBAR_AUXILIARY_CONTROL_DISPLAY }}>
                    <Tooltip title={t('log.nav.jumpToToday')}>
                        <span>
                            <IconButton
                                size="small"
                                aria-label={t('log.nav.jumpToToday')}
                                onClick={navigation.goToToday}
                                disabled={navigation.date === navigation.maxDate}
                                sx={{ display: { xs: 'none', sm: 'inline-flex', md: 'none' } }}
                            >
                                <TodayRoundedIcon fontSize="small" />
                            </IconButton>
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={navigation.goToToday}
                                disabled={navigation.date === navigation.maxDate}
                                sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                            >
                                {t('today.title')}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
};

export default LogDateNavigationCluster;
