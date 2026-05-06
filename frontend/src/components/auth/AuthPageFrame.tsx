import React from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';
import RestaurantMenuRoundedIcon from '@mui/icons-material/RestaurantMenuRounded';
import MonitorWeightRoundedIcon from '@mui/icons-material/MonitorWeightRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import { alpha } from '@mui/material/styles';
import AppCard from '../../ui/AppCard';
import AppPage from '../../ui/AppPage';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/resources';

const AUTH_PAGE_MAX_WIDTH_PX = 880; // Leaves room for a compact product rail without recreating the full landing page.
const AUTH_FORM_MAX_WIDTH_PX = 440; // Keeps auth entry points focused and readable on desktop without feeling oversized.
const AUTH_RAIL_ICON_SIZE_PX = 36; // Fixed icon wells keep the feature list aligned across locales.

type AuthFeature = {
    titleKey: TranslationKey;
    bodyKey: TranslationKey;
    icon: React.ReactElement;
};

const AUTH_FEATURES: AuthFeature[] = [
    {
        titleKey: 'landing.feature.foodTracking.title',
        bodyKey: 'landing.feature.foodTracking.body',
        icon: <RestaurantMenuRoundedIcon />
    },
    {
        titleKey: 'landing.feature.weighIns.title',
        bodyKey: 'landing.feature.weighIns.body',
        icon: <MonitorWeightRoundedIcon />
    },
    {
        titleKey: 'landing.feature.projection.title',
        bodyKey: 'landing.feature.projection.body',
        icon: <TimelineRoundedIcon />
    }
];

type AuthPageFrameProps = {
    title: string;
    subtitle: string;
    onSubmit: (event: React.FormEvent) => void;
    children: React.ReactNode;
};

type AuthFeatureItemProps = {
    feature: AuthFeature;
};

/**
 * Compact feature row used in the auth rail.
 */
function AuthFeatureItem({ feature }: AuthFeatureItemProps) {
    const { t } = useI18n();

    return (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
            <Box
                sx={(theme) => ({
                    width: AUTH_RAIL_ICON_SIZE_PX,
                    height: AUTH_RAIL_ICON_SIZE_PX,
                    flex: `0 0 ${AUTH_RAIL_ICON_SIZE_PX}px`,
                    borderRadius: 1.5,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'primary.main',
                    backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1),
                    '& .MuiSvgIcon-root': {
                        fontSize: 20
                    }
                })}
                aria-hidden
            >
                {feature.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2">
                    {t(feature.titleKey)}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{
                        color: 'text.secondary',
                        display: { xs: 'none', sm: 'block' }
                    }}
                >
                    {t(feature.bodyKey)}
                </Typography>
            </Box>
        </Stack>
    );
}

/**
 * Shared sign-in/create-account layout.
 *
 * The public entry point is intentionally direct: form first, with a restrained feature rail for new visitors.
 */
const AuthPageFrame: React.FC<AuthPageFrameProps> = ({
    title,
    subtitle,
    onSubmit,
    children
}) => {
    const { t } = useI18n();

    return (
        <AppPage maxWidth={AUTH_PAGE_MAX_WIDTH_PX}>
            <Box
                sx={{
                    minHeight: { md: 'calc(100svh - 240px)' },
                    display: 'flex',
                    alignItems: { md: 'center' }
                }}
            >
                <AppCard contentSx={{ p: { xs: 2.25, sm: 3, md: 3.5 } }}>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: `${AUTH_FORM_MAX_WIDTH_PX}px minmax(0, 1fr)` },
                            gap: { xs: 2.25, md: 4 },
                            alignItems: 'center'
                        }}
                    >
                        <Stack component="form" spacing={2} onSubmit={onSubmit} sx={{ minWidth: 0 }}>
                            <Box>
                                <Typography variant="h4" component="h1">
                                    {title}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                                    {subtitle}
                                </Typography>
                            </Box>
                            {children}
                        </Stack>

                        <Divider sx={{ display: { xs: 'block', md: 'none' } }} />

                        <Box
                            component="aside"
                            aria-label={t('auth.frameTitle')}
                            sx={(theme) => ({
                                borderRadius: 2,
                                border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18)}`,
                                backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.06),
                                p: { xs: 1.5, sm: 2, md: 2.5 },
                                alignSelf: 'stretch',
                                display: 'flex',
                                alignItems: 'center'
                            })}
                        >
                            <Stack spacing={{ xs: 1.5, md: 2 }} sx={{ width: '100%' }}>
                                <Box>
                                    <Typography variant="h6" component="h2">
                                        {t('auth.frameTitle')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                                        {t('auth.frameBody')}
                                    </Typography>
                                </Box>

                                <Stack spacing={1.35}>
                                    {AUTH_FEATURES.map((feature) => (
                                        <AuthFeatureItem key={feature.titleKey} feature={feature} />
                                    ))}
                                </Stack>
                            </Stack>
                        </Box>
                    </Box>
                </AppCard>
            </Box>
        </AppPage>
    );
};

export default AuthPageFrame;
