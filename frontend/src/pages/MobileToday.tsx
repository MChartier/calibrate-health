import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Paper, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import CalorieSummary from '../components/CalorieSummary';
import DayCompletionControl from '../components/DayCompletionControl';
import GoalTrackerCard from '../components/GoalTrackerCard';
import TodayHeader from '../components/TodayHeader';
import WeightSummaryCard from '../components/WeightSummaryCard';
import WeightTrend from '../components/WeightTrend';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { useQuickAddFab } from '../context/useQuickAddFab';
import { useI18n } from '../i18n/useI18n';
import { LOG_DATE_QUERY_PARAM, useLogDateNavigationState } from '../hooks/useLogDateNavigationState';
import { getQuickAddAction } from '../utils/quickAddShortcut';

const MOBILE_TODAY_TABS = {
    today: 'today',
    progress: 'progress'
} as const;

type MobileTodayTab = (typeof MOBILE_TODAY_TABS)[keyof typeof MOBILE_TODAY_TABS];
const MOBILE_DASHBOARD_TAB_BAR_HEIGHT_PX = 64; // Fixed local switcher height reserved at the bottom of the mobile hub.
const MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX = 48; // Compact but thumb-friendly tab target for the two hub modes.
const MOBILE_LOG_PANEL_MIN_HEIGHT = 'calc(100svh - 180px)'; // Reserves enough height for the day-status footer to settle near the viewport bottom.

/**
 * Build the Food route while preserving a non-today selected day.
 */
function getFoodLogPath(selectedDate: string, today: string): string {
    if (selectedDate === today) return '/log';
    const params = new URLSearchParams({ [LOG_DATE_QUERY_PARAM]: selectedDate });
    return `/log?${params.toString()}`;
}

/**
 * Mobile Today route: a glanceable answer plus top-level logging actions.
 */
const MobileToday: React.FC = () => {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<MobileTodayTab>(MOBILE_TODAY_TABS.today);
    const [weightTrendDialogOpen, setWeightTrendDialogOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedDate, today, navigation } = useLogDateNavigationState();
    const isSelectedToday = selectedDate === today;
    const {
        dialogs,
        openWeightDialogForLogDate,
        openWeightDialogFromFab,
        setLogDateNavigation,
        setLogDateOverride
    } = useQuickAddFab();
    const isTodayTabActive = activeTab === MOBILE_TODAY_TABS.today;
    const isProgressTabActive = activeTab === MOBILE_TODAY_TABS.progress;

    useEffect(() => {
        setLogDateOverride(isTodayTabActive ? selectedDate : null);
        return () => {
            setLogDateOverride(null);
        };
    }, [isTodayTabActive, selectedDate, setLogDateOverride]);

    useEffect(() => {
        setLogDateNavigation(isTodayTabActive ? navigation : null);
        return () => {
            setLogDateNavigation(null);
        };
    }, [isTodayTabActive, navigation, setLogDateNavigation]);

    const quickAddAction = getQuickAddAction(searchParams);

    useEffect(() => {
        if (!quickAddAction) return;

        navigation.setDate(today);

        switch (quickAddAction) {
            case QUICK_ADD_SHORTCUT_ACTIONS.food:
                dialogs.openFoodDialog();
                break;
            case QUICK_ADD_SHORTCUT_ACTIONS.weight:
                openWeightDialogFromFab();
                break;
            default:
                break;
        }

        if (searchParams.has(QUICK_ADD_SHORTCUT_QUERY_PARAM)) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete(QUICK_ADD_SHORTCUT_QUERY_PARAM);
            setSearchParams(nextParams, { replace: true });
        }
    }, [
        dialogs,
        navigation,
        openWeightDialogFromFab,
        quickAddAction,
        searchParams,
        setSearchParams,
        today
    ]);

    const foodLogPath = useMemo(() => getFoodLogPath(selectedDate, today), [selectedDate, today]);
    const handleTabChange = (_event: React.SyntheticEvent, nextTab: MobileTodayTab) => {
        setActiveTab(nextTab);
    };
    const handleOpenWeightTrendDialog = () => setWeightTrendDialogOpen(true);
    const handleCloseWeightTrendDialog = () => setWeightTrendDialogOpen(false);

    return (
        <Stack spacing={1.5} useFlexGap sx={{ pb: `calc(${MOBILE_DASHBOARD_TAB_BAR_HEIGHT_PX}px + var(--safe-area-inset-bottom, 0px))` }}>
            <Box role="tabpanel" hidden={!isTodayTabActive} aria-label={t('today.tabs.today')} sx={isTodayTabActive ? { minHeight: MOBILE_LOG_PANEL_MIN_HEIGHT } : undefined}>
                {isTodayTabActive && (
                    <Stack spacing={1.5} useFlexGap sx={{ minHeight: MOBILE_LOG_PANEL_MIN_HEIGHT }}>
                        <Stack spacing={1.5} useFlexGap>
                            <TodayHeader navigation={navigation} />
                            <CalorieSummary date={selectedDate} isSelectedToday={isSelectedToday} />
                            <Button
                                component={RouterLink}
                                to={foodLogPath}
                                variant="contained"
                                size="large"
                                startIcon={<AddRoundedIcon />}
                                sx={{ py: 1.35 }}
                            >
                                {t('today.addFood')}
                            </Button>
                            <WeightSummaryCard date={selectedDate} onOpenWeightEntry={openWeightDialogForLogDate} />
                        </Stack>
                        <Box sx={{ flexGrow: 1 }} />
                        <DayCompletionControl date={selectedDate} />
                    </Stack>
                )}
            </Box>

            <Box role="tabpanel" hidden={!isProgressTabActive} aria-label={t('today.tabs.progress')}>
                {isProgressTabActive && (
                    <Stack spacing={1.5} useFlexGap>
                        <GoalTrackerCard isDashboard />
                        <WeightTrend
                            action={
                                <Button size="small" variant="text" onClick={handleOpenWeightTrendDialog}>
                                    {t('today.weightTrend.expandGraph')}
                                </Button>
                            }
                        />
                    </Stack>
                )}
            </Box>

            <Paper
                elevation={8}
                sx={(theme) => ({
                    position: 'fixed',
                    right: 0,
                    bottom: 0,
                    left: 0,
                    zIndex: theme.zIndex.appBar,
                    borderRadius: 0,
                    borderTop: 1,
                    borderColor: 'divider',
                    px: `calc(${theme.spacing(1)} + var(--safe-area-inset-left, 0px))`,
                    pt: 0.75,
                    pb: `calc(${theme.spacing(0.75)} + var(--safe-area-inset-bottom, 0px))`,
                    bgcolor: 'background.paper'
                })}
            >
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    variant="fullWidth"
                    aria-label={t('today.tabs.ariaLabel')}
                    sx={{
                        minHeight: MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX,
                        '& .MuiTab-root': {
                            minHeight: MOBILE_DASHBOARD_TAB_MIN_HEIGHT_PX,
                            fontWeight: 'bold'
                        }
                    }}
                >
                    <Tab value={MOBILE_TODAY_TABS.today} label={t('today.tabs.today')} />
                    <Tab value={MOBILE_TODAY_TABS.progress} label={t('today.tabs.progress')} />
                </Tabs>
            </Paper>

            <Dialog
                open={weightTrendDialogOpen}
                onClose={handleCloseWeightTrendDialog}
                fullScreen
                aria-labelledby="weight-trend-dialog-title"
            >
                <Box
                    sx={{
                        minHeight: '100dvh',
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: 'background.default'
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            px: `calc(16px + var(--safe-area-inset-left, 0px))`,
                            pt: `calc(12px + var(--safe-area-inset-top, 0px))`,
                            pb: 1
                        }}
                    >
                        <Typography id="weight-trend-dialog-title" variant="h6">
                            {t('today.weightTrend.title')}
                        </Typography>
                        <Tooltip title={t('common.close')}>
                            <IconButton onClick={handleCloseWeightTrendDialog} aria-label={t('common.close')}>
                                <CloseRoundedIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <DialogContent sx={{ flex: 1, minHeight: 0, p: { xs: 1, sm: 2 } }}>
                        <WeightTrend fullScreen sx={{ height: '100%' }} />
                    </DialogContent>
                </Box>
            </Dialog>
        </Stack>
    );
};

export default MobileToday;
