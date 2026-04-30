import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import { useI18n } from '../i18n/useI18n';
import LogDateNavigationCluster from './LogDateNavigationCluster';

export type TodayHeaderProps = {
    navigation: LogDateNavigationState;
};

const TODAY_TITLE_ROW_MIN_HEIGHT_PX = 40; // Keeps the title aligned with the centered date navigation controls.
const TODAY_TITLE_DISPLAY = { xs: 'none', md: 'flex' } as const; // Below desktop, the date picker is the visible date context.

/**
 * Header for the Today workspace: selected-day title on the left, date controls centered.
 */
const TodayHeader: React.FC<TodayHeaderProps> = ({ navigation }) => {
    const { t } = useI18n();
    const isSelectedToday = navigation.date === navigation.maxDate;
    const pageTitle = isSelectedToday ? t('today.title') : navigation.dateLabel;

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: { xs: 1, sm: 1.5, md: 2 },
                alignItems: 'center'
            }}
        >
            <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                <Box
                    sx={{
                        display: TODAY_TITLE_DISPLAY,
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        minHeight: TODAY_TITLE_ROW_MIN_HEIGHT_PX
                    }}
                >
                    <Typography variant="h4" component="h1" sx={{ lineHeight: 1.12 }}>
                        {pageTitle}
                    </Typography>
                </Box>
            </Stack>

            <LogDateNavigationCluster
                navigation={navigation}
                placement="page"
                showTodayShortcut
                sx={{ display: { xs: 'inline-flex', sm: 'none' }, justifySelf: 'center', width: '100%' }}
            />
        </Box>
    );
};

export default TodayHeader;
