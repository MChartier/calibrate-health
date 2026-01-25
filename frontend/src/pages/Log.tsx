import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    IconButton,
    Stack,
    Tooltip
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import TodayIcon from '@mui/icons-material/TodayRounded';
import { useTheme } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import FoodLogMeals from '../components/FoodLogMeals';
import { useQueryClient } from '@tanstack/react-query';
import LogSummaryCard from '../components/LogSummaryCard';
import WeightSummaryCard from '../components/WeightSummaryCard';
import LogDatePickerControl from '../components/LogDatePickerControl';
import { useAuth } from '../context/useAuth';
import { useQuickAddFab } from '../context/useQuickAddFab';
import {
    QUICK_ADD_SHORTCUT_ACTIONS,
    QUICK_ADD_SHORTCUT_QUERY_PARAM,
    type QuickAddShortcutAction
} from '../constants/pwaShortcuts';
import {
    addDaysToIsoDate,
    clampIsoDate,
    formatDateToLocalDateString,
    formatIsoDateForDisplay,
    getTodayIsoDate
} from '../utils/date';
import { fetchFoodLog, foodLogQueryKey, useFoodLogQuery } from '../queries/foodLog';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';

/**
 * Daily food log page with date navigation and quick-add shortcuts.
 *
 * Manages local-day bounds and keeps quick-add dialogs in sync with URL actions.
 */
type LogDateBounds = { min: string; max: string };

/**
 * Compute inclusive local-day bounds for /log date navigation.
 *
 * Lower bound: the user's account creation day (prevents absurd date ranges like year 0001).
 * Upper bound: today in the user's timezone (no future days).
 */
function getLogDateBounds(args: { todayIso: string; createdAtIso?: string; timeZone: string }): LogDateBounds {
    const max = args.todayIso;
    const createdAt = args.createdAtIso;
    if (!createdAt) return { min: max, max };

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) return { min: max, max };

    const minRaw = formatDateToLocalDateString(createdAtDate, args.timeZone);
    // Defensive: if clocks are skewed, ensure bounds stay sane.
    const min = minRaw > max ? max : minRaw;
    return { min, max };
}

/**
 * Resolve a valid quick-add action from the URL query string (used by PWA shortcuts).
 */
function getQuickAddAction(searchParams: URLSearchParams): QuickAddShortcutAction | null {
    const action = searchParams.get(QUICK_ADD_SHORTCUT_QUERY_PARAM);
    if (action === QUICK_ADD_SHORTCUT_ACTIONS.food) return QUICK_ADD_SHORTCUT_ACTIONS.food;
    if (action === QUICK_ADD_SHORTCUT_ACTIONS.weight) return QUICK_ADD_SHORTCUT_ACTIONS.weight;
    return null;
}

const Log: React.FC = () => {
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const { user } = useAuth();
    const { dialogs, openWeightDialogForLogDate, openWeightDialogFromFab, setLogDateOverride } = useQuickAddFab();
    const { openFoodDialog } = dialogs;
    const theme = useTheme();
    const { sectionGap, sectionGapCompact } = theme.custom.layout.page;
    // Tighter section spacing on small screens keeps log sections visually compact.
    const sectionSpacing = { xs: sectionGapCompact, sm: sectionGapCompact, md: sectionGap };
    const [searchParams, setSearchParams] = useSearchParams();
    const timeZone = useMemo(
        () => user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [user?.timezone]
    );
    const today = useMemo(() => getTodayIsoDate(timeZone), [timeZone]);

    const dateBounds = useMemo(() => {
        return getLogDateBounds({ todayIso: today, createdAtIso: user?.created_at, timeZone });
    }, [today, timeZone, user?.created_at]);

    const [selectedDate, setSelectedDate] = useState(() => today);

    // Clamp selection when the bounds change (e.g. user profile loads, timezone changes).
    useEffect(() => {
        setSelectedDate((prev) => {
            const clamped = clampIsoDate(prev, dateBounds);
            return clamped === prev ? prev : clamped;
        });
    }, [dateBounds]);

    const effectiveDate = clampIsoDate(selectedDate, dateBounds);
    const effectiveDateLabel = useMemo(() => formatIsoDateForDisplay(effectiveDate), [effectiveDate]);

    const foodQuery = useFoodLogQuery(effectiveDate);

    useEffect(() => {
        const prevDate = addDaysToIsoDate(effectiveDate, -1);
        if (prevDate >= dateBounds.min) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(prevDate),
                queryFn: () => fetchFoodLog(prevDate)
            });
        }

        const nextDate = addDaysToIsoDate(effectiveDate, 1);
        if (nextDate <= dateBounds.max) {
            void queryClient.prefetchQuery({
                queryKey: foodLogQueryKey(nextDate),
                queryFn: () => fetchFoodLog(nextDate)
            });
        }
    }, [dateBounds.max, dateBounds.min, effectiveDate, queryClient]);

    const canGoBack = effectiveDate > dateBounds.min;
    const canGoForward = effectiveDate < dateBounds.max;

    useEffect(() => {
        setLogDateOverride(effectiveDate);
    }, [effectiveDate, setLogDateOverride]);

    useEffect(() => {
        return () => {
            setLogDateOverride(null);
        };
    }, [setLogDateOverride]);

    const quickAddAction = getQuickAddAction(searchParams);

    useEffect(() => {
        if (!quickAddAction) return;

        const quickAddDate = dateBounds.max;
        if (selectedDate !== quickAddDate) {
            setSelectedDate(quickAddDate);
        }

        switch (quickAddAction) {
            case QUICK_ADD_SHORTCUT_ACTIONS.food:
                openFoodDialog();
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
        dateBounds.max,
        openFoodDialog,
        openWeightDialogFromFab,
        quickAddAction,
        searchParams,
        selectedDate,
        setSearchParams
    ]);

    return (
        <Stack spacing={sectionSpacing} useFlexGap>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' }
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%'
                    }}
                >
                    <Tooltip title={t('log.nav.prevDay')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.prevDay')}
                                onClick={() =>
                                    setSelectedDate(clampIsoDate(addDaysToIsoDate(effectiveDate, -1), dateBounds))
                                }
                                disabled={!canGoBack}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <LogDatePickerControl
                        value={effectiveDate}
                        label={t('log.date.label')}
                        ariaLabel={t('log.datePicker.aria', { date: effectiveDateLabel })}
                        min={dateBounds.min}
                        max={dateBounds.max}
                        onChange={(nextDate) => setSelectedDate(clampIsoDate(nextDate, dateBounds))}
                    />

                    <Tooltip title={t('log.nav.nextDay')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.nextDay')}
                                onClick={() => {
                                    const next = addDaysToIsoDate(effectiveDate, 1);
                                    setSelectedDate(clampIsoDate(next, dateBounds));
                                }}
                                disabled={!canGoForward}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Tooltip title={t('log.nav.jumpToToday')}>
                        <span>
                            <IconButton
                                aria-label={t('log.nav.jumpToToday')}
                                onClick={() => setSelectedDate(dateBounds.max)}
                                disabled={effectiveDate === dateBounds.max}
                            >
                                <TodayIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: sectionSpacing,
                    alignItems: 'stretch'
                }}
            >
                <LogSummaryCard date={effectiveDate} />

                <WeightSummaryCard date={effectiveDate} onOpenWeightEntry={openWeightDialogForLogDate} />
            </Box>

            <AppCard>
                {foodQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={() => void foodQuery.refetch()}>
                                {t('common.retry')}
                            </Button>
                        }
                    >
                        {t('log.foodLog.error')}
                    </Alert>
                ) : (
                    <FoodLogMeals logs={foodQuery.data ?? []} isLoading={foodQuery.isLoading} />
                )}
            </AppCard>
        </Stack>
    );
};

export default Log;
