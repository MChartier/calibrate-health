import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AppBar,
    Avatar,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Tooltip,
    Typography,
    useMediaQuery
} from '@mui/material';
import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/DashboardRounded';
import ListAltIcon from '@mui/icons-material/ListAltRounded';
import ShowChartIcon from '@mui/icons-material/ShowChartRounded';
import PersonIcon from '@mui/icons-material/PersonRounded';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import TodayIcon from '@mui/icons-material/TodayRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { QuickAddFabProvider } from '../context/QuickAddFabContext';
import { useQuickAddFab } from '../context/useQuickAddFab';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import AppPage from '../ui/AppPage';
import { getAvatarLabel } from '../utils/avatarLabel';
import { getTodayIsoDate } from '../utils/date';
import { useI18n } from '../i18n/useI18n';
import { QUICK_ADD_FAB_PAGE_BOTTOM_PADDING } from '../constants/quickAddFab';
import LogQuickAddFab from './LogQuickAddFab';
import LogDatePickerControl from './LogDatePickerControl';
import { useIncompleteTodayBadge } from '../hooks/useIncompleteTodayBadge';
import { useInstallState } from '../hooks/useInstallState';

/**
 * App shell layout with navigation chrome and quick-add entry points.
 */
const drawerWidth = 240;
const SAFE_AREA_INSET_TOP = 'var(--safe-area-inset-top, 0px)';
const SAFE_AREA_INSET_BOTTOM = 'var(--safe-area-inset-bottom, 0px)';
const SAFE_AREA_INSET_LEFT = 'var(--safe-area-inset-left, 0px)';
const SAFE_AREA_INSET_RIGHT = 'var(--safe-area-inset-right, 0px)';
const TOOLBAR_HORIZONTAL_PADDING_SPACING = { xs: 1, sm: 2 }; // Reduce horizontal padding on xs so centered controls have enough room on small phones.
const DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING = 7; // MUI default toolbar height in spacing units (56px).
const DRAWER_NAV_ITEM_BORDER_RADIUS = 0;
const NAV_BRAND_LOGO_SIZE_PX = 32; // Brand icon size in the AppBar; matches the avatar scale without dominating the toolbar.
const NAV_BRAND_LOGO_BORDER_RADIUS_PX = 8; // Slight rounding keeps the square logo from feeling visually harsh against rounded UI chrome.
const NAV_BRAND_GAP_SPACING = { xs: 0.75, md: 1 }; // Space between the logo and brand text once the md sidebar layout is active.
const NAV_BRAND_TEXT_DISPLAY = { xs: 'none', md: 'block' } as const; // Show the brand wordmark whenever the md sidebar is present.
const NAV_BRAND_BADGE_DISPLAY = { xs: 'none', md: 'inline-flex' } as const; // Only show the worktree badge when the wordmark is visible.
const NAV_DATE_CONTROLS_GAP_SPACING = { xs: 0.5, sm: 0.75 }; // Tighten date control spacing on xs so the cluster fits between brand and avatar.
const NAV_DATE_PICKER_WIDTH_PX = { xs: 122, sm: 168, md: 200 }; // Narrower widths keep the centered control from colliding with brand/avatar on small phones.
const NAV_DATE_PICKER_MIN_WIDTH_PX = 104; // Allow the picker to shrink on xs while staying readable.
const NAV_DATE_PICKER_MAX_WIDTH_PX = 220; // Keep the date picker from growing too wide on desktop layouts.
const NAV_CENTER_PADDING_X_SPACING = { xs: 0.5, sm: 1 }; // Add small horizontal breathing room around the centered date controls.
const NAV_INSTALL_ICON_SIZE = 'small'; // Keep the install icon compact on xs viewports where toolbar width is tight.
/**
 * Keep drawer navigation backgrounds rectangular and flush so adjacent states do not visually overlap.
 */
const drawerNavItemSx: SxProps<Theme> = { borderRadius: DRAWER_NAV_ITEM_BORDER_RADIUS };
/**
 * Map the current pathname to a navigation value so nested routes keep the correct tab highlighted.
 */
function getActiveNavigationValue(pathname: string): string | null {
    if (pathname.startsWith('/dashboard')) return '/dashboard';
    if (pathname.startsWith('/log')) return '/log';
    if (pathname.startsWith('/goals')) return '/goals';
    if (pathname.startsWith('/profile')) return '/profile';
    return null;
}

/**
 * Normalize MUI toolbar min-heights into CSS length strings for safe-area math.
 */
function normalizeToolbarMinHeight(minHeight: number | string | undefined, fallback: string): string {
    if (typeof minHeight === 'number') return `${minHeight}px`;
    if (typeof minHeight === 'string' && minHeight.trim().length > 0) return minHeight;
    return fallback;
}

/**
 * Build Toolbar sizing that includes safe-area padding so fixed headers and their spacers align.
 */
function buildSafeAreaToolbarSx(theme: Theme): SxProps<Theme> {
    const fallbackMinHeight = theme.spacing(DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING);
    const baseMinHeight = normalizeToolbarMinHeight(theme.mixins.toolbar.minHeight, fallbackMinHeight);
    const toolbarMixins = theme.mixins.toolbar as Record<string, { minHeight?: number | string } | undefined>;
    const smMinHeight = normalizeToolbarMinHeight(toolbarMixins[theme.breakpoints.up('sm')]?.minHeight, baseMinHeight);

    return {
        pt: SAFE_AREA_INSET_TOP,
        pl: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.xs)} + ${SAFE_AREA_INSET_LEFT})`,
        pr: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.xs)} + ${SAFE_AREA_INSET_RIGHT})`,
        minHeight: `calc(${baseMinHeight} + ${SAFE_AREA_INSET_TOP})`,
        [theme.breakpoints.up('sm')]: {
            minHeight: `calc(${smMinHeight} + ${SAFE_AREA_INSET_TOP})`,
            pl: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.sm)} + ${SAFE_AREA_INSET_LEFT})`,
            pr: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.sm)} + ${SAFE_AREA_INSET_RIGHT})`
        }
    };
}

type NavbarLogDateControlsProps = {
    navigation: LogDateNavigationState;
    compact: boolean;
};

/**
 * Render the centered `/log` date navigation cluster inside the AppBar.
 */
const NavbarLogDateControls: React.FC<NavbarLogDateControlsProps> = ({ navigation, compact }) => {
    const { t } = useI18n();
    const iconButtonSize = compact ? 'small' : 'medium';
    // Hide the dedicated "today" button on xs to keep the control cluster within the available toolbar width.
    const showTodayButton = !compact;
    const isAtToday = navigation.date === navigation.maxDate;
    const datePickerAriaLabel = t('log.datePicker.aria', { date: navigation.dateLabel });

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: NAV_DATE_CONTROLS_GAP_SPACING,
                width: '100%',
                minWidth: 0
            }}
        >
            <Tooltip title={t('log.nav.prevDay')}>
                <span>
                    <IconButton
                        size={iconButtonSize}
                        aria-label={t('log.nav.prevDay')}
                        onClick={navigation.goToPreviousDate}
                        disabled={!navigation.canGoBack}
                    >
                        <ChevronLeftIcon fontSize={compact ? 'small' : 'medium'} />
                    </IconButton>
                </span>
            </Tooltip>

            <Box
                sx={{
                    flexGrow: 0,
                    width: NAV_DATE_PICKER_WIDTH_PX,
                    minWidth: NAV_DATE_PICKER_MIN_WIDTH_PX,
                    maxWidth: NAV_DATE_PICKER_MAX_WIDTH_PX
                }}
            >
                <LogDatePickerControl
                    placement="navbar"
                    value={navigation.date}
                    ariaLabel={datePickerAriaLabel}
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
                        <ChevronRightIcon fontSize={compact ? 'small' : 'medium'} />
                    </IconButton>
                </span>
            </Tooltip>

            {showTodayButton && (
                <Tooltip title={t('log.nav.jumpToToday')}>
                    <span>
                        <IconButton
                            size={iconButtonSize}
                            aria-label={t('log.nav.jumpToToday')}
                            onClick={navigation.goToToday}
                            disabled={isAtToday}
                        >
                            <TodayIcon fontSize={compact ? 'small' : 'medium'} />
                        </IconButton>
                    </span>
                </Tooltip>
            )}
        </Box>
    );
};

const LayoutShell: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const { dialogs, logDateOverride, logDateNavigation } = useQuickAddFab();
    const { t } = useI18n();
    const theme = useTheme();
    const { isInstalled, canInstallPrompt, platformHint, showInstallCta, promptInstall } = useInstallState();
    useIncompleteTodayBadge();
    const safeAreaToolbarSx = useMemo(() => buildSafeAreaToolbarSx(theme), [theme]);
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const navigate = useNavigate();
    const location = useLocation();
    const worktreeName = import.meta.env.VITE_WORKTREE_NAME?.trim();
    const isMainWorktree = import.meta.env.VITE_WORKTREE_IS_MAIN === 'true';
    const worktreeBadgeLabel = worktreeName && !isMainWorktree ? worktreeName : null;
    const [isIosInstallDialogOpen, setIsIosInstallDialogOpen] = useState(false);

    const hideNav = location.pathname.startsWith('/onboarding');
    const showAppNav = Boolean(user) && !isLoading && !hideNav;
    const showAuthActions = !user && !isLoading;
    const isLoginRoute = location.pathname.startsWith('/login');
    const isRegisterRoute = location.pathname.startsWith('/register');
    const showLoginCta = showAuthActions && !isLoginRoute;
    const showRegisterCta = showAuthActions && !isRegisterRoute;
    const showSettingsShortcut = Boolean(user) && !isLoading && !hideNav;
    const showInstallShortcut = showInstallCta && !hideNav;
    const showDrawer = showAppNav && isDesktop;
    const showBottomNav = showAppNav && !isDesktop;
    const authCtaSize = isDesktop ? 'medium' : 'small';
    const registerCtaLabel = isDesktop ? t('auth.createAccount') : t('auth.register');
    const today = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar sx={safeAreaToolbarSx} />

            <Box sx={{ flexGrow: 1 }}>
                <List disablePadding>
                    <ListItemButton
                        selected={location.pathname.startsWith('/dashboard')}
                        component={RouterLink}
                        to="/dashboard"
                        sx={drawerNavItemSx}
                    >
                        <ListItemIcon>
                            <DashboardIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.dashboard')} />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/log')}
                        component={RouterLink}
                        to="/log"
                        sx={drawerNavItemSx}
                    >
                        <ListItemIcon>
                            <ListAltIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.log')} />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/goals')}
                        component={RouterLink}
                        to="/goals"
                        sx={drawerNavItemSx}
                    >
                        <ListItemIcon>
                            <ShowChartIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.goals')} />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/profile')}
                        component={RouterLink}
                        to="/profile"
                        sx={drawerNavItemSx}
                    >
                        <ListItemIcon>
                            <PersonIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.profile')} />
                    </ListItemButton>
                </List>
            </Box>

            <Divider />

            <List disablePadding>
                <ListItemButton
                    selected={location.pathname.startsWith('/settings')}
                    component={RouterLink}
                    to="/settings"
                    sx={drawerNavItemSx}
                >
                    <ListItemIcon>
                        <SettingsIcon />
                    </ListItemIcon>
                    <ListItemText primary={t('nav.settings')} />
                </ListItemButton>

                <ListItemButton onClick={handleLogout} sx={drawerNavItemSx}>
                    <ListItemIcon>
                        <LogoutIcon />
                    </ListItemIcon>
                    <ListItemText primary={t('nav.logOut')} />
                </ListItemButton>
            </List>
        </Box>
    );

    const navigationValue = getActiveNavigationValue(location.pathname);
    const showQuickAdd = showAppNav && Boolean(navigationValue);
    const isLogRoute = location.pathname.startsWith('/log');
    const showLogDateControls = isLogRoute && Boolean(logDateNavigation);
    const fabDate = isLogRoute && logDateOverride ? logDateOverride : today;
    const { closeFoodDialog, closeWeightDialog } = dialogs;

    useEffect(() => {
        closeFoodDialog();
        closeWeightDialog();
    }, [closeFoodDialog, closeWeightDialog, location.pathname]);

    /**
     * Route the navbar Install CTA to Chromium's deferred prompt when available, otherwise iOS instructions.
     */
    const handleInstallClick = useCallback(() => {
        if (canInstallPrompt) {
            void promptInstall();
            return;
        }
        if (platformHint === 'ios') {
            setIsIosInstallDialogOpen(true);
        }
    }, [canInstallPrompt, platformHint, promptInstall]);

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
                <Toolbar sx={safeAreaToolbarSx}>
                    <Box
                        component={RouterLink}
                        to={user ? '/dashboard' : '/'}
                        aria-label={t('app.brand')}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: NAV_BRAND_GAP_SPACING,
                            color: 'inherit',
                            textDecoration: 'none',
                            flexShrink: 0,
                            minWidth: 0
                        }}
                    >
                        <Box
                            component="img"
                            src="/icon.png"
                            alt=""
                            aria-hidden="true"
                            sx={{
                                width: NAV_BRAND_LOGO_SIZE_PX,
                                height: NAV_BRAND_LOGO_SIZE_PX,
                                borderRadius: `${NAV_BRAND_LOGO_BORDER_RADIUS_PX}px`,
                                display: 'block'
                            }}
                        />
                        <Typography variant="h6" sx={{ display: NAV_BRAND_TEXT_DISPLAY }}>
                            {t('app.brand')}
                        </Typography>
                        {worktreeBadgeLabel && (
                            <Box
                                component="span"
                                sx={{
                                    display: NAV_BRAND_BADGE_DISPLAY,
                                    border: (t) =>
                                        `1px solid ${alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.22 : 0.18)}`,
                                    borderRadius: 999,
                                    px: 1,
                                    py: 0.25,
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    backgroundColor: (t) =>
                                        alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.12),
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {worktreeBadgeLabel}
                            </Box>
                        )}
                    </Box>

                    <Box
                        sx={{
                            flexGrow: 1,
                            flexBasis: 0,
                            minWidth: 0,
                            px: NAV_CENTER_PADDING_X_SPACING,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {showLogDateControls && logDateNavigation ? (
                            <NavbarLogDateControls navigation={logDateNavigation} compact={isXs} />
                        ) : null}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                        {(showLoginCta || showRegisterCta) && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {showLoginCta && (
                                    <Button
                                        component={RouterLink}
                                        to="/login"
                                        color="inherit"
                                        variant="text"
                                        size={authCtaSize}
                                    >
                                        {t('auth.signIn')}
                                    </Button>
                                )}
                                {showRegisterCta && (
                                    <Button component={RouterLink} to="/register" variant="contained" size={authCtaSize}>
                                        {registerCtaLabel}
                                    </Button>
                                )}
                            </Box>
                        )}

                        {showInstallShortcut && (
                            <Tooltip title={t('nav.install')}>
                                {isXs ? (
                                    <IconButton color="inherit" aria-label={t('nav.openInstallAria')} onClick={handleInstallClick}>
                                        <DownloadRoundedIcon fontSize={NAV_INSTALL_ICON_SIZE} />
                                    </IconButton>
                                ) : (
                                    <Button
                                        color="inherit"
                                        variant="outlined"
                                        size={authCtaSize}
                                        onClick={handleInstallClick}
                                        startIcon={<DownloadRoundedIcon />}
                                    >
                                        {t('nav.install')}
                                    </Button>
                                )}
                            </Tooltip>
                        )}

                        {showSettingsShortcut && (
                            <Tooltip title={t('nav.settings')}>
                                <IconButton
                                    color="inherit"
                                    onClick={() => navigate('/settings')}
                                    aria-label={t('nav.openSettingsAria')}
                                >
                                    <Avatar
                                        src={user?.profile_image_url ?? undefined}
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.12),
                                            color: 'text.primary',
                                            fontWeight: 900
                                        }}
                                    >
                                        {getAvatarLabel(user?.email)}
                                    </Avatar>
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            {showDrawer && (
                <Drawer
                    variant="permanent"
                    sx={{
                        width: drawerWidth,
                        flexShrink: 0,
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
                    }}
                >
                    {drawerContent}
                </Drawer>
            )}

            <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                <Toolbar sx={safeAreaToolbarSx} />
                <Box sx={showQuickAdd ? { pb: QUICK_ADD_FAB_PAGE_BOTTOM_PADDING } : undefined}>
                    <AppPage fullBleedOnXs={showBottomNav} reserveBottomNavSpace={showBottomNav}>
                        <Outlet />
                    </AppPage>
                </Box>
            </Box>

            {showBottomNav && (
                <Box
                    sx={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderTop: (t) => `1px solid ${t.palette.divider}`,
                        bgcolor: 'background.paper',
                        pb: SAFE_AREA_INSET_BOTTOM,
                        zIndex: (t) => t.zIndex.appBar
                    }}
                >
                    <BottomNavigation
                        showLabels
                        value={navigationValue}
                        onChange={(_, next) => {
                            if (typeof next === 'string') {
                                navigate(next);
                            }
                        }}
                    >
                        <BottomNavigationAction value="/dashboard" label={t('nav.dashboard')} icon={<DashboardIcon />} />
                        <BottomNavigationAction value="/log" label={t('nav.log')} icon={<ListAltIcon />} />
                        <BottomNavigationAction value="/goals" label={t('nav.goals')} icon={<ShowChartIcon />} />
                        <BottomNavigationAction value="/profile" label={t('nav.profile')} icon={<PersonIcon />} />
                    </BottomNavigation>
                </Box>
            )}

            {showQuickAdd && <LogQuickAddFab date={fabDate} />}

            <Dialog
                open={isIosInstallDialogOpen && !isInstalled}
                onClose={() => setIsIosInstallDialogOpen(false)}
                fullWidth
                maxWidth="xs"
            >
                <DialogTitle>{t('install.ios.title')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        {t('install.ios.body')}
                    </Typography>
                    <Box component="ol" sx={{ mt: 2, mb: 0, pl: 2.5 }}>
                        <li>
                            <Typography variant="body2">{t('install.ios.step1')}</Typography>
                        </li>
                        <li>
                            <Typography variant="body2">{t('install.ios.step2')}</Typography>
                        </li>
                        <li>
                            <Typography variant="body2">{t('install.ios.step3')}</Typography>
                        </li>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsIosInstallDialogOpen(false)}>{t('common.close')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const Layout: React.FC = () => (
    <QuickAddFabProvider>
        <LayoutShell />
    </QuickAddFabProvider>
);

export default Layout;
