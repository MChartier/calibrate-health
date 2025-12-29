import React from 'react';
import { Box, Button, Chip, Divider, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DevicesIcon from '@mui/icons-material/DevicesRounded';
import EditNoteIcon from '@mui/icons-material/EditNoteRounded';
import MoneyOffIcon from '@mui/icons-material/MoneyOffRounded';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightRounded';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import { Link as RouterLink } from 'react-router-dom';
import AppCard from '../ui/AppCard';
import AppPage from '../ui/AppPage';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const HERO_BLOB_ANIMATION_DURATION_MS = 14000; // Slow drift for hero background blobs (disabled with prefers-reduced-motion).
const HERO_BLOB_BLUR_PX = 46; // Keeps hero blobs "glowy" instead of drawing attention with sharp edges.
const FEATURE_ICON_SIZE_PX = 44; // Consistent icon block size so the feature grid feels aligned.

type LandingFeature = {
    title: string;
    description: string;
    icon: React.ReactElement;
};

const LANDING_FEATURES: LandingFeature[] = [
    {
        title: 'Free and ad-free',
        description: 'A clean tracker without ads competing for your attention.',
        icon: <MoneyOffIcon />
    },
    {
        title: 'Self-hostable',
        description: 'Run it yourself with Docker and keep your data under your control.',
        icon: <StorageIcon />
    },
    {
        title: 'First-class mobile + desktop',
        description: 'Designed to feel great on your phone, tablet, and laptop.',
        icon: <DevicesIcon />
    },
    {
        title: 'QR / barcode scanning',
        description: 'Use your camera to speed up food entry when you have a code to scan.',
        icon: <QrCodeScannerIcon />
    },
    {
        title: 'Custom food items',
        description: 'Add anything with a name and calories - perfect for home cooking and meals out.',
        icon: <EditNoteIcon />
    },
    {
        title: 'Daily weigh-ins + trends',
        description: 'Record weight regularly and watch your trend line over time.',
        icon: <MonitorWeightIcon />
    }
];

/**
 * LandingFeatureCard
 *
 * Small marketing tile used to outline a single app capability.
 */
function LandingFeatureCard({ feature }: { feature: LandingFeature }) {
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
                    <Typography variant="subtitle1">{feature.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {feature.description}
                    </Typography>
                </Box>
            </Stack>
        </AppCard>
    );
}

/**
 * LandingPreviewCard
 *
 * A tiny, stylized "this is what the app feels like" panel for the hero section.
 * It's intentionally not a screenshot so it stays resilient to UI changes.
 */
function LandingPreviewCard() {
    return (
        <AppCard
            sx={(theme) => ({
                position: 'relative',
                overflow: 'hidden',
                borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.12),
                backgroundImage: `linear-gradient(180deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.03)}, transparent 60%)`
            })}
        >
            <Stack spacing={1.5}>
                <Typography variant="subtitle2" sx={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Today
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
                            1,420
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            calories consumed
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle1">/ 1,900</Typography>
                        <Typography variant="body2" color="text.secondary">
                            target
                        </Typography>
                    </Box>
                </Box>

                <LinearProgress variant="determinate" value={74} />

                <Divider />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1">176.4</Typography>
                        <Typography variant="body2" color="text.secondary">
                            weight (trend)
                        </Typography>
                    </Box>
                    <Chip label="Projected goal date" size="small" variant="outlined" />
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
                                        Free, self-hostable food + weight tracking
                                    </Typography>

                                    <Typography variant="h2" component="h1" sx={{ lineHeight: 1.05 }}>
                                        Get and stay fit.
                                    </Typography>

                                    <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '56ch' }}>
                                        cal.io is the free, self-hostable solution for food and weight tracking.
                                    </Typography>
                                </Stack>

                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    <Chip label="Free + ad-free" size="small" variant="outlined" />
                                    <Chip label="Self-hostable" size="small" variant="outlined" />
                                    <Chip label="Mobile + desktop" size="small" variant="outlined" />
                                    <Chip label="Scan codes" size="small" variant="outlined" />
                                    <Chip label="Custom foods" size="small" variant="outlined" />
                                </Stack>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: 'stretch' }}>
                                    <Button
                                        component={RouterLink}
                                        to="/register"
                                        variant="contained"
                                        size="large"
                                        sx={{ minWidth: { sm: 200 } }}
                                    >
                                        Create your account
                                    </Button>
                                    <Button
                                        component={RouterLink}
                                        to="/login"
                                        variant="outlined"
                                        size="large"
                                        sx={{ minWidth: { sm: 160 } }}
                                    >
                                        Sign in
                                    </Button>
                                </Stack>

                                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '68ch' }}>
                                    Built for daily use: fast logging, clear targets, and an interface that stays out of
                                    your way.
                                </Typography>
                            </Stack>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex', alignItems: 'center' }}>
                            <Box sx={{ width: '100%' }}>
                                <LandingPreviewCard />
                            </Box>
                        </Grid>
                    </Grid>
                </AppCard>

                <Stack spacing={1.25}>
                    <Typography variant="h4" component="h2">
                        Built for daily consistency
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '80ch' }}>
                        You&apos;re trying to build a habit. cal.io is intentionally opinionated: simple inputs, clear outputs,
                        and a dashboard that answers the only question that matters today.
                    </Typography>
                </Stack>

                <Grid container spacing={2} alignItems="stretch">
                    {LANDING_FEATURES.map((feature) => (
                        <Grid key={feature.title} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex' }}>
                            <LandingFeatureCard feature={feature} />
                        </Grid>
                    ))}
                </Grid>

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
                                    Ready to start tracking?
                                </Typography>
                                <Typography variant="body1" color="text.secondary">
                                    Create an account, set your goal deficit, and log your first day. You can always tune
                                    the target later.
                                </Typography>
                            </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Stack direction={{ xs: 'column', sm: 'row', md: 'column' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                <Button component={RouterLink} to="/register" variant="contained" size="large">
                                    Create account
                                </Button>
                                <Button component={RouterLink} to="/login" variant="text" size="large">
                                    I already have one
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
