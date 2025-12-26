import React, { useMemo, useState } from 'react';
import type { PaletteMode } from '@mui/material';
import {
    Alert,
    AppBar,
    Avatar,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Toolbar,
    Typography
} from '@mui/material';
import { alpha, darken, type Theme, ThemeProvider } from '@mui/material/styles';
import { ScopedCssBaseline } from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Gauge } from '@mui/x-charts/Gauge';
import { createDesignPreviewTheme, DESIGN_STYLE_LABELS, type DesignStyleId } from './designThemes';

const PREVIEW_HEIGHT = 760;

type Props = {
    style: DesignStyleId;
    mode: PaletteMode;
};

/**
 * Build a per-style background using layered gradients (contained to the preview frame).
 * The goal is to communicate "direction" without relying on global CSS.
 */
function getPreviewBackgroundImage(theme: Theme, style: DesignStyleId): string {
    const isDark = theme.palette.mode === 'dark';

    if (style === 'quiet-wellness') {
        const sage = theme.palette.primary.main;
        const clay = theme.palette.secondary.main;
        return isDark
            ? `radial-gradient(900px 520px at 15% -10%, ${alpha(sage, 0.22)}, transparent 62%),
               radial-gradient(820px 520px at 110% 0%, ${alpha(clay, 0.16)}, transparent 55%),
               linear-gradient(180deg, ${theme.palette.background.default}, ${darken(theme.palette.background.default, 0.08)})`
            : `radial-gradient(900px 520px at 15% -10%, ${alpha(sage, 0.14)}, transparent 62%),
               radial-gradient(820px 520px at 110% 0%, ${alpha(clay, 0.12)}, transparent 55%),
               linear-gradient(180deg, ${theme.palette.background.default}, ${darken(theme.palette.background.default, 0.03)})`;
    }

    if (style === 'athletic-data') {
        const gridLine = alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06);
        const accent = alpha(theme.palette.primary.main, isDark ? 0.14 : 0.1);
        return `radial-gradient(1000px 520px at 30% -10%, ${accent}, transparent 60%),
                repeating-linear-gradient(90deg, ${gridLine} 0 1px, transparent 1px 28px),
                repeating-linear-gradient(0deg, ${gridLine} 0 1px, transparent 1px 28px),
                linear-gradient(180deg, ${theme.palette.background.default}, ${darken(theme.palette.background.default, isDark ? 0.12 : 0.04)})`;
    }

    // citrus-ink
    const citrus = theme.palette.primary.main;
    const inkGlow = alpha(citrus, isDark ? 0.16 : 0.1);
    return isDark
        ? `radial-gradient(1000px 540px at 20% -10%, ${alpha('#FF6A3D', 0.2)}, transparent 60%),
           radial-gradient(900px 520px at 110% 10%, ${inkGlow}, transparent 56%),
           linear-gradient(180deg, ${theme.palette.background.default}, ${darken(theme.palette.background.default, 0.18)})`
        : `radial-gradient(1000px 540px at 20% -10%, ${alpha('#FF6A3D', 0.12)}, transparent 60%),
           radial-gradient(900px 520px at 110% 10%, ${inkGlow}, transparent 56%),
           linear-gradient(180deg, ${theme.palette.background.default}, ${darken(theme.palette.background.default, 0.06)})`;
}

/**
 * Render a contained, interactive-ish "mini app" so style differences show up on real UI primitives.
 */
const DesignStylePreview: React.FC<Props> = ({ style, mode }) => {
    const theme = useMemo(() => createDesignPreviewTheme(style, mode), [mode, style]);
    const [navValue, setNavValue] = useState('/log');

    const previewBackground = useMemo(() => getPreviewBackgroundImage(theme, style), [style, theme]);

    return (
        <ThemeProvider theme={theme}>
            <ScopedCssBaseline>
                <Paper
                    elevation={0}
                    sx={{
                        height: { xs: 'auto', md: PREVIEW_HEIGHT },
                        minHeight: PREVIEW_HEIGHT,
                        overflow: 'hidden',
                        borderRadius: 4,
                        border: (t) => `1px solid ${alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.22 : 0.14)}`
                    }}
                >
                    <Box
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundImage: previewBackground
                        }}
                    >
                        <AppBar position="static" elevation={0}>
                            <Toolbar sx={{ gap: 1 }}>
                                <Typography variant="h6" sx={{ lineHeight: 1 }}>
                                    cal.io
                                </Typography>
                                <Chip
                                    size="small"
                                    label={DESIGN_STYLE_LABELS[style]}
                                    sx={{
                                        ml: 0.5,
                                        fontWeight: 800,
                                        backgroundColor: (t) =>
                                            alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.12)
                                    }}
                                />
                                <Box sx={{ flexGrow: 1 }} />
                                <IconButton aria-label="Notifications" size="small">
                                    <NotificationsNoneRoundedIcon fontSize="small" />
                                </IconButton>
                                <Avatar
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                        bgcolor: (t) => alpha(t.palette.primary.main, 0.18),
                                        color: 'text.primary'
                                    }}
                                >
                                    M
                                </Avatar>
                            </Toolbar>
                        </AppBar>

                        <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
                            <Stack spacing={2}>
                                <Box>
                                    <Typography variant="overline" sx={{ opacity: 0.8 }}>
                                        Demo Dashboard
                                    </Typography>
                                    <Typography variant="h5">Today</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        A quick scan of targets, intake, and momentum.
                                    </Typography>
                                </Box>

                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip label="On track" color="success" variant="outlined" />
                                    <Chip label="750 kcal remaining" color="primary" variant="filled" />
                                    <Chip label="Weigh-in due" variant="outlined" />
                                </Stack>

                                <Alert
                                    severity="info"
                                    sx={{
                                        border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.28)}`,
                                        backgroundColor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.08 : 0.06)
                                    }}
                                >
                                    Tip: log foods as you go. Small entries make trend tracking more accurate.
                                </Alert>

                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                        gap: 2,
                                        alignItems: 'stretch'
                                    }}
                                >
                                    <Card sx={{ height: '100%' }}>
                                        <CardContent>
                                            <Stack spacing={1}>
                                                <Typography variant="subtitle2" color="text.secondary">
                                                    Daily Target
                                                </Typography>
                                                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                                                    2,200 kcal
                                                </Typography>
                                                <Divider />
                                                <Stack direction="row" spacing={1} justifyContent="space-between">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Burn (TDEE)
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                        2,700
                                                    </Typography>
                                                </Stack>
                                                <Stack direction="row" spacing={1} justifyContent="space-between">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Goal change
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                        -500
                                                    </Typography>
                                                </Stack>
                                                <Stack direction="row" spacing={1} justifyContent="space-between">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Net target
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                        2,200
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                        </CardContent>
                                    </Card>

                                    <Card sx={{ height: '100%' }}>
                                        <CardContent>
                                            <Stack spacing={1}>
                                                <Typography variant="subtitle2" color="text.secondary">
                                                    Intake
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                                    <Box>
                                                        <Typography variant="h4" sx={{ fontWeight: 800 }}>
                                                            1,450
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            kcal logged
                                                        </Typography>
                                                    </Box>
                                                    <Gauge
                                                        width={160}
                                                        height={120}
                                                        startAngle={-90}
                                                        endAngle={90}
                                                        value={1450}
                                                        valueMin={0}
                                                        valueMax={2200}
                                                        innerRadius="70%"
                                                        outerRadius="90%"
                                                        text={() => ''}
                                                        sx={{
                                                            '& .MuiGauge-referenceArc': {
                                                                fill: (t) => alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.16 : 0.12)
                                                            },
                                                            '& .MuiGauge-valueArc': {
                                                                fill: (t) => t.palette.primary.main
                                                            }
                                                        }}
                                                    />
                                                </Box>
                                                <Stack direction="row" spacing={1} justifyContent="space-between">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Remaining
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                                        750 kcal
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                </Box>

                                <Card>
                                    <CardContent>
                                        <Stack spacing={1.5}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                                <Box>
                                                    <Typography variant="h6">Quick Add</Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Fast logging for common foods.
                                                    </Typography>
                                                </Box>
                                                <Button variant="contained" startIcon={<AddRoundedIcon />}>
                                                    Add
                                                </Button>
                                            </Box>

                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: { xs: '1fr', sm: '1.4fr 0.6fr' },
                                                    gap: 1.5
                                                }}
                                            >
                                                <TextField label="Food name" placeholder="e.g. Greek yogurt" />
                                                <TextField label="Calories" inputMode="numeric" placeholder="120" />
                                            </Box>

                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                <Chip label="Breakfast" variant="outlined" />
                                                <Chip label="Lunch" variant="outlined" />
                                                <Chip label="Dinner" variant="outlined" />
                                                <Chip label="Snack" variant="outlined" />
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent>
                                        <Stack spacing={1}>
                                            <Typography variant="h6">Recent Entries</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                A list view to test density, dividers, and selection states.
                                            </Typography>
                                            <Divider />
                                            <List disablePadding>
                                                {[
                                                    { label: 'Oat milk latte', secondary: 'Breakfast · 140 kcal' },
                                                    { label: 'Chicken salad', secondary: 'Lunch · 420 kcal' },
                                                    { label: 'Protein bar', secondary: 'Afternoon snack · 210 kcal' }
                                                ].map((item) => (
                                                    <ListItem
                                                        key={item.label}
                                                        disableGutters
                                                        secondaryAction={
                                                            <Chip
                                                                size="small"
                                                                label={item.secondary.split('·')[1]?.trim() ?? '—'}
                                                                sx={{
                                                                    fontWeight: 800,
                                                                    backgroundColor: (t) =>
                                                                        alpha(
                                                                            t.palette.primary.main,
                                                                            t.palette.mode === 'dark' ? 0.18 : 0.12
                                                                        )
                                                                }}
                                                            />
                                                        }
                                                        sx={{
                                                            py: 1,
                                                            borderRadius: 2,
                                                            transition: 'background-color 120ms ease',
                                                            '&:hover': {
                                                                backgroundColor: (t) => alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.06 : 0.04)
                                                            }
                                                        }}
                                                    >
                                                        <ListItemAvatar>
                                                            <Avatar
                                                                sx={{
                                                                    width: 36,
                                                                    height: 36,
                                                                    bgcolor: (t) =>
                                                                        alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.16 : 0.08),
                                                                    color: 'text.primary',
                                                                    fontWeight: 900
                                                                }}
                                                            >
                                                                {item.label[0]}
                                                            </Avatar>
                                                        </ListItemAvatar>
                                                        <ListItemText
                                                            primary={<Typography sx={{ fontWeight: 800 }}>{item.label}</Typography>}
                                                            secondary={<Typography variant="caption">{item.secondary}</Typography>}
                                                        />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Stack>
                        </Box>

                        <Box sx={{ p: 2, pt: 0 }}>
                            <BottomNavigation
                                showLabels
                                value={navValue}
                                onChange={(_, next) => {
                                    if (typeof next === 'string') setNavValue(next);
                                }}
                                sx={{
                                    position: 'relative',
                                    boxShadow: (t) => t.shadows[8]
                                }}
                            >
                                <BottomNavigationAction value="/dashboard" label="Dashboard" icon={<DashboardRoundedIcon />} />
                                <BottomNavigationAction value="/log" label="Log" icon={<ListAltRoundedIcon />} />
                                <BottomNavigationAction value="/goals" label="Goals" icon={<ShowChartRoundedIcon />} />
                                <BottomNavigationAction value="/settings" label="Settings" icon={<SettingsRoundedIcon />} />
                            </BottomNavigation>
                        </Box>
                    </Box>
                </Paper>
            </ScopedCssBaseline>
        </ThemeProvider>
    );
};

export default DesignStylePreview;
