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
    placement: 'navbar' | 'page';
    showTodayShortcut?: boolean;
    sx?: SxProps<Theme>;
};

const DATE_CLUSTER_GAP_SPACING = 0.5; // Horizontal gap between date navigation controls.
const NAVBAR_DATE_CONTROL_WIDTH_PX = { xs: 148, sm: 188, md: 220 }; // Keeps the app-bar date picker centered without crowding actions.
const PAGE_DATE_CONTROL_WIDTH_PX = { xs: 176, sm: 196, md: 220 }; // Larger page control width for the mobile header fallback.

/**
 * Shared selected-day navigation controls for the app bar and compact page header.
 */
const LogDateNavigationCluster: React.FC<LogDateNavigationClusterProps> = ({
    navigation,
    placement,
    showTodayShortcut = false,
    sx
}) => {
    const { t } = useI18n();
    const isNavbarPlacement = placement === 'navbar';
    const iconButtonSize = isNavbarPlacement ? 'small' : 'medium';
    const pickerWidth = isNavbarPlacement ? NAVBAR_DATE_CONTROL_WIDTH_PX : PAGE_DATE_CONTROL_WIDTH_PX;

    return (
        <Box
            sx={mergeSx(
                {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: DATE_CLUSTER_GAP_SPACING,
                    minWidth: 0
                },
                sx
            )}
        >
            <Tooltip title={t('log.nav.prevDay')}>
                <span>
                    <IconButton
                        size={iconButtonSize}
                        aria-label={t('log.nav.prevDay')}
                        onClick={navigation.goToPreviousDate}
                        disabled={!navigation.canGoBack}
                    >
                        <ChevronLeftRoundedIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>

            <Box sx={{ width: pickerWidth, maxWidth: '100%' }}>
                <LogDatePickerControl
                    placement={placement}
                    value={navigation.date}
                    ariaLabel={t('log.datePicker.aria', { date: navigation.dateLabel })}
                    min={navigation.minDate}
                    max={navigation.maxDate}
                    onChange={navigation.setDate}
                />
            </Box>

            <Tooltip title={t('log.nav.nextDay')}>
                <span>
                    <IconButton
                        size={iconButtonSize}
                        aria-label={t('log.nav.nextDay')}
                        onClick={navigation.goToNextDate}
                        disabled={!navigation.canGoForward}
                    >
                        <ChevronRightRoundedIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>

            {showTodayShortcut && (
                <Tooltip title={t('log.nav.jumpToToday')}>
                    <span>
                        {isNavbarPlacement ? (
                            <>
                                <IconButton
                                    size={iconButtonSize}
                                    aria-label={t('log.nav.jumpToToday')}
                                    onClick={navigation.goToToday}
                                    disabled={navigation.date === navigation.maxDate}
                                    sx={{ display: { xs: 'inline-flex', md: 'none' } }}
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
                            </>
                        ) : (
                            <IconButton
                                aria-label={t('log.nav.jumpToToday')}
                                onClick={navigation.goToToday}
                                disabled={navigation.date === navigation.maxDate}
                            >
                                <TodayRoundedIcon />
                            </IconButton>
                        )}
                    </span>
                </Tooltip>
            )}
        </Box>
    );
};

export default LogDateNavigationCluster;
