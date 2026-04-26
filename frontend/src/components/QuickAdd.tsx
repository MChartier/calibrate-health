import React, { useMemo } from 'react';
import { Box, Button, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import type { MealPeriod } from '../types/mealPeriod';
import { useMyFoodsQuery } from '../queries/myFoods';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';

export type QuickAddProps = {
    onAddFood: (mealPeriod?: MealPeriod | null) => void;
};

const QUICK_ADD_SAVED_FOOD_LIMIT = 4; // Number of saved foods shown before the full dialog takes over.

/**
 * Lightweight search/add entry point that keeps food logging visible below the timeline.
 */
const QuickAdd: React.FC<QuickAddProps> = ({ onAddFood }) => {
    const { t } = useI18n();
    const myFoodsQuery = useMyFoodsQuery({ q: '', type: 'ALL' });
    const savedFoods = useMemo(() => (myFoodsQuery.data ?? []).slice(0, QUICK_ADD_SAVED_FOOD_LIMIT), [myFoodsQuery.data]);

    return (
        <AppCard
            contentSx={{
                p: { xs: 1.25, sm: 1.75 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.75 } },
                background: (theme) =>
                    theme.palette.mode === 'dark'
                        ? 'linear-gradient(90deg, rgba(46, 125, 50, 0.14), transparent)'
                        : 'linear-gradient(90deg, rgba(46, 125, 50, 0.08), transparent)'
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 0.8fr) auto minmax(0, 1fr)' },
                    gap: { xs: 1.25, md: 1.5 },
                    alignItems: 'center'
                }}
            >
                <Stack spacing={0.75}>
                    <Typography variant="subtitle2">{t('today.quickAdd.title')}</Typography>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={() => onAddFood(null)}
                        startIcon={<SearchRoundedIcon />}
                        fullWidth
                        sx={{
                            justifyContent: 'space-between',
                            minHeight: 40,
                            color: 'text.secondary',
                            borderColor: 'divider',
                            px: 1.25
                        }}
                    >
                        <Box component="span" sx={{ flexGrow: 1, textAlign: 'left', fontWeight: 600 }}>
                            {t('today.quickAdd.searchPlaceholder')}
                        </Box>
                        <Tooltip title={t('foodEntry.search.scanBarcode')}>
                            <Box component="span" aria-hidden sx={{ display: 'inline-flex', color: 'text.secondary' }}>
                                <QrCodeScannerRoundedIcon fontSize="small" />
                            </Box>
                        </Tooltip>
                    </Button>
                </Stack>

                <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                        {t('today.quickAdd.savedFoods')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        {savedFoods.length > 0 ? (
                            savedFoods.map((food) => (
                                <Chip
                                    key={food.id}
                                    label={food.name}
                                    variant="outlined"
                                    onClick={() => onAddFood(null)}
                                    sx={{ maxWidth: { xs: '100%', sm: 180 } }}
                                />
                            ))
                        ) : (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {myFoodsQuery.isLoading ? t('common.loading') : t('today.quickAdd.emptySavedFoods')}
                            </Typography>
                        )}
                        <Button size="small" variant="text" startIcon={<AddRoundedIcon />} onClick={() => onAddFood(null)}>
                            {t('today.addFood')}
                        </Button>
                    </Box>
                </Stack>
            </Box>
        </AppCard>
    );
};

export default QuickAdd;
