import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import { useI18n } from '../i18n/useI18n';

export type TodayHeaderProps = {
    navigation: LogDateNavigationState;
};

const TODAY_TITLE_ROW_MIN_HEIGHT_PX = 40; // Keeps the title aligned with the centered date navigation controls.

/**
 * Header for the Today workspace. Date controls live in the app bar at all widths.
 */
const TodayHeader: React.FC<TodayHeaderProps> = ({ navigation }) => {
    const { t } = useI18n();
    const isSelectedToday = navigation.date === navigation.maxDate;
    const pageTitle = isSelectedToday ? t('today.title') : navigation.dateLabel;

    return (
        <Box
            sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '1fr',
                gap: { xs: 1, sm: 1.5, md: 2 },
                alignItems: 'center'
            }}
        >
            <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                <Box
                    sx={{
                        display: 'flex',
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
        </Box>
    );
};

export default TodayHeader;
