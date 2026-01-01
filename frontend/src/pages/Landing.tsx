import React from 'react';
import { Box, Button, Chip, Grid, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DevicesIcon from '@mui/icons-material/DevicesRounded';
import MoneyOffIcon from '@mui/icons-material/MoneyOffRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import ShowChartIcon from '@mui/icons-material/ShowChartRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import { Link as RouterLink } from 'react-router-dom';
import AppCard from '../ui/AppCard';
import AppPage from '../ui/AppPage';
import LandingAppPreview from '../components/landing/LandingAppPreview';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useI18n } from '../i18n/useI18n';
import type { TranslationKey } from '../i18n/resources';

const HERO_BLOB_ANIMATION_DURATION_MS = 14000; // Slow drift for hero background blobs (disabled with prefers-reduced-motion).
const HERO_BLOB_BLUR_PX = 46; // Keeps hero blobs "glowy" instead of drawing attention with sharp edges.
const FEATURE_ICON_SIZE_PX = 44; // Consistent icon block size so the feature grid feels aligned.

type LandingFeature = {
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    icon: React.ReactElement;
};

const LANDING_GOAL_FEATURES: LandingFeature[] = [
    {
        titleKey: 'landing.feature.weighIns.title',
        descriptionKey: 'landing.feature.weighIns.body',
        icon: <MonitorWeightIcon />
    },
    {
        titleKey: 'landing.feature.foodTracking.title',
        descriptionKey: 'landing.feature.foodTracking.body',
        icon: <QrCodeScannerIcon />
    },
    {
        titleKey: 'landing.feature.projection.title',
        descriptionKey: 'landing.feature.projection.body',
        icon: <ShowChartIcon />
    }
];

const LANDING_VALUE_FEATURES: LandingFeature[] = [
    {
        titleKey: 'landing.feature.freeAdFree.title',
        descriptionKey: 'landing.feature.freeAdFree.body',
        icon: <MoneyOffIcon />
    },
    {
        titleKey: 'landing.feature.selfHostable.title',
        descriptionKey: 'landing.feature.selfHostable.body',
        icon: <StorageIcon />
    },
    {
        titleKey: 'landing.feature.mobileDesktop.title',
        descriptionKey: 'landing.feature.mobileDesktop.body',
        icon: <DevicesIcon />
    }
];

const LANDING_PILL_KEYS = [
    'landing.hero.pill.freeAdFree',
    'landing.hero.pill.selfHostable',
    'landing.hero.pill.mobileDesktop'
] as const satisfies readonly TranslationKey[];

/**
 * LandingFeatureCard
 *
 * Small marketing tile used to outline a single app capability.
 */
function LandingFeatureCard({ feature }: { feature: LandingFeature }) {
    const { t } = useI18n();

    return (
        <AppCard sx={{ height: '100%' }}>
            <Stack spacing={1.25}>
                <Box
                    sx={(theme) => ({
                        width: FEATURE_ICON_SIZE_PX,
                        height: FEATURE_ICON_SIZE_PX,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 12,
                        border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.35 : 0.24)}`,
                        backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                        '& .MuiSvgIcon-root': {
                            fontSize: 22,
                            color: theme.palette.primary.main
                        }
                    })}
                    aria-hidden
                >
                    {feature.icon}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1">{t(feature.titleKey)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t(feature.descriptionKey)}
                    </Typography>
                </Box>
            </Stack>
        </AppCard>
    );
}

/**
 * Landing
 *
 * Marketing landing page shown to unauthenticated visitors.
 */
const Landing: React.FC = () => {
    const { t } = useI18n();
    const prefersReducedMotion = usePrefersReducedMotion();

    return (
        <AppPage maxWidth="wide">
            <Stack spacing={{ xs: 4, sm: 5 }}>
                <AppCard
                    sx={(theme) => ({
                        position: 'relative',
                        overflow: 'hidden',
                        borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.22),
                        backgroundImage: `radial-gradient(900px 520px at 10% 0%, ${alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.18 : 0.12
                        )}, transparent 60%),
                        radial-gradient(820px 520px at 100% 10%, ${alpha(
                            theme.palette.secondary.main,
                            theme.palette.mode === 'dark' ? 0.16 : 0.1
                        )}, transparent 55%)`,
                        '@keyframes heroBlobDrift': {
                            from: { transform: 'translate3d(-3%, -2%, 0) scale(1)' },
                            to: { transform: 'translate3d(3%, 2%, 0) scale(1.03)' }
                        },
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            inset: '-42%',
                            background: `radial-gradient(circle at 35% 40%, ${alpha(
                                theme.palette.primary.main,
                                theme.palette.mode === 'dark' ? 0.26 : 0.18
                            )}, transparent 58%)`,
                            filter: `blur(${HERO_BLOB_BLUR_PX}px)`,
                            opacity: theme.palette.mode === 'dark' ? 0.75 : 0.6,
                            animation: prefersReducedMotion
                                ? 'none'
                                : `heroBlobDrift ${HERO_BLOB_ANIMATION_DURATION_MS}ms ease-in-out infinite alternate`,
                            pointerEvents: 'none'
                        },
                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            inset: '-48%',
                            background: `radial-gradient(circle at 70% 30%, ${alpha(
                                theme.palette.secondary.main,
                                theme.palette.mode === 'dark' ? 0.22 : 0.14
                            )}, transparent 60%)`,
                            filter: `blur(${Math.round(HERO_BLOB_BLUR_PX * 0.9)}px)`,
                            opacity: theme.palette.mode === 'dark' ? 0.65 : 0.5,
                            animation: prefersReducedMotion
                                ? 'none'
                                : `heroBlobDrift ${Math.round(HERO_BLOB_ANIMATION_DURATION_MS * 1.15)}ms ease-in-out infinite alternate-reverse`,
                            pointerEvents: 'none'
                        }
                    })}
                >
                    <Grid container spacing={{ xs: 3, md: 4 }} alignItems="stretch">
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={2.5} sx={{ position: 'relative' }}>
                                <Stack spacing={1}>
                                    <Typography
                                        variant="overline"
                                        sx={{
                                            letterSpacing: '0.16em',
                                            textTransform: 'uppercase',
                                            color: 'text.secondary'
                                        }}
                                    >
                                        {t('landing.hero.overline')}
                                    </Typography>

                                    <Typography variant="h2" component="h1" sx={{ lineHeight: 1.05 }}>
                                        {t('landing.hero.title')}
                                    </Typography>

                                    <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '56ch' }}>
                                        {t('landing.hero.subtitleLine1')}
                                        <br />
                                        {t('landing.hero.subtitleLine2')}
                                    </Typography>
                                </Stack>

                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    {LANDING_PILL_KEYS.map((pillKey) => (
                                        <Chip key={pillKey} label={t(pillKey)} size="small" variant="outlined" />
                                    ))}
                                </Stack>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: 'stretch' }}>
                                    <Button
                                        component={RouterLink}
                                        to="/register"
                                        variant="contained"
                                        size="large"
                                        sx={{ flex: 1, minWidth: 0 }}
                                    >
                                        {t('auth.createAccount')}
                                    </Button>
                                    <Button
                                        component={RouterLink}
                                        to="/login"
                                        variant="outlined"
                                        size="large"
                                        sx={{ flex: 1, minWidth: 0 }}
                                    >
                                        {t('auth.signIn')}
                                    </Button>
                                </Stack>

                                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '68ch' }}>
                                    {t('landing.hero.body')}
                                </Typography>
                            </Stack>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex', alignItems: 'center' }}>
                            <Box sx={{ width: '100%' }}>
                                <LandingAppPreview />
                            </Box>
                        </Grid>
                    </Grid>
                </AppCard>

                <Box>
                    <Stack spacing={1.25} sx={{ mb: 2 }}>
                        <Typography variant="h4" component="h2">
                            {t('landing.section.goals.title')}
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '80ch' }}>
                            {t('landing.section.goals.body')}
                        </Typography>
                    </Stack>

                    <Grid container spacing={2} alignItems="stretch">
                        {LANDING_GOAL_FEATURES.map((feature) => (
                            <Grid key={feature.titleKey} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex' }}>
                                <LandingFeatureCard feature={feature} />
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                <Box>
                    <Stack spacing={1.25} sx={{ mb: 2 }}>
                        <Typography variant="h4" component="h2">
                            {t('landing.section.value.title')}
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '80ch' }}>
                            {t('landing.section.value.body')}
                        </Typography>
                    </Stack>

                    <Grid container spacing={2} alignItems="stretch">
                        {LANDING_VALUE_FEATURES.map((feature) => (
                            <Grid key={feature.titleKey} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex' }}>
                                <LandingFeatureCard feature={feature} />
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                <AppCard
                    sx={(theme) => ({
                        backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.06),
                        borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.36 : 0.22)
                    })}
                >
                    <Grid container spacing={{ xs: 2, md: 3 }} alignItems="center">
                        <Grid size={{ xs: 12, md: 8 }}>
                            <Stack spacing={0.75}>
                                <Typography variant="h5" component="h3">
                                    {t('landing.cta.title')}
                                </Typography>
                                <Typography variant="body1" color="text.secondary">
                                    {t('landing.cta.body')}
                                </Typography>
                            </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Stack direction={{ xs: 'column', sm: 'row', md: 'column' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                <Button component={RouterLink} to="/register" variant="contained" size="large">
                                    {t('auth.createAccount')}
                                </Button>
                                <Button component={RouterLink} to="/login" variant="text" size="large">
                                    {t('landing.cta.haveAccountButton')}
                                </Button>
                            </Stack>
                        </Grid>
                    </Grid>
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Landing;
