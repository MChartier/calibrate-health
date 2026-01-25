import React, { useEffect, useMemo } from 'react';
import {
    AppBar,
    Avatar,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Button,
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
import GitHubIcon from '@mui/icons-material/GitHub';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import { QuickAddFabProvider } from '../context/QuickAddFabContext';
import { useQuickAddFab } from '../context/useQuickAddFab';
import AppPage from '../ui/AppPage';
import { getAvatarLabel } from '../utils/avatarLabel';
import { getTodayIsoDate } from '../utils/date';
import { useI18n } from '../i18n/useI18n';
import { QUICK_ADD_FAB_PAGE_BOTTOM_PADDING } from '../constants/quickAddFab';
import { CALIBRATE_REPO_URL } from '../constants/links';
import LogQuickAddFab from './LogQuickAddFab';

/**
 * App shell layout with navigation chrome and quick-add entry points.
 */
const drawerWidth = 240;
const SAFE_AREA_INSET_TOP = 'var(--safe-area-inset-top, 0px)';
const SAFE_AREA_INSET_BOTTOM = 'var(--safe-area-inset-bottom, 0px)';
const DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING = 7; // MUI default toolbar height in spacing units (56px).
const DRAWER_NAV_ITEM_BORDER_RADIUS = 0;
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
 * Build Toolbar sizing that includes top safe-area padding so fixed headers and their spacers align.
 */
function buildSafeAreaToolbarSx(theme: Theme): SxProps<Theme> {
    const fallbackMinHeight = theme.spacing(DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING);
    const baseMinHeight = normalizeToolbarMinHeight(theme.mixins.toolbar.minHeight, fallbackMinHeight);
    const toolbarMixins = theme.mixins.toolbar as Record<string, { minHeight?: number | string } | undefined>;
    const smMinHeight = normalizeToolbarMinHeight(toolbarMixins[theme.breakpoints.up('sm')]?.minHeight, baseMinHeight);

    return {
        pt: SAFE_AREA_INSET_TOP,
        minHeight: `calc(${baseMinHeight} + ${SAFE_AREA_INSET_TOP})`,
        [theme.breakpoints.up('sm')]: {
            minHeight: `calc(${smMinHeight} + ${SAFE_AREA_INSET_TOP})`
        }
    };
}

const LayoutShell: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const { dialogs, logDateOverride } = useQuickAddFab();
    const { t } = useI18n();
    const theme = useTheme();
    const safeAreaToolbarSx = useMemo(() => buildSafeAreaToolbarSx(theme), [theme]);
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const navigate = useNavigate();
    const location = useLocation();
    const worktreeName = import.meta.env.VITE_WORKTREE_NAME?.trim();
    const isMainWorktree = import.meta.env.VITE_WORKTREE_IS_MAIN === 'true';
    const worktreeBadgeLabel = worktreeName && !isMainWorktree ? worktreeName : null;

    const hideNav = location.pathname.startsWith('/onboarding');
    const showAppNav = Boolean(user) && !isLoading && !hideNav;
    const showAuthActions = !user && !isLoading;
    const isLoginRoute = location.pathname.startsWith('/login');
    const isRegisterRoute = location.pathname.startsWith('/register');
    const showLoginCta = showAuthActions && !isLoginRoute;
    const showRegisterCta = showAuthActions && !isRegisterRoute;
    const showSettingsShortcut = Boolean(user) && !isLoading && !hideNav;
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
    const fabDate = isLogRoute && logDateOverride ? logDateOverride : today;
    const { closeFoodDialog, closeWeightDialog } = dialogs;

    useEffect(() => {
        closeFoodDialog();
        closeWeightDialog();
    }, [closeFoodDialog, closeWeightDialog, location.pathname]);

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
                <Toolbar sx={safeAreaToolbarSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                            variant="h6"
                            component={RouterLink}
                            to={user ? '/dashboard' : '/'}
                            sx={{ color: 'inherit', textDecoration: 'none' }}
                        >
                            {t('app.brand')}
                        </Typography>
                        {worktreeBadgeLabel && (
                            <Box
                                component="span"
                                sx={{
                                    border: (t) => `1px solid ${alpha(t.palette.text.primary, t.palette.mode === 'dark' ? 0.22 : 0.18)}`,
                                    borderRadius: 999,
                                    px: 1,
                                    py: 0.25,
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    backgroundColor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.12),
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {worktreeBadgeLabel}
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    <Tooltip title={t('nav.github')}>
                        <IconButton
                            component="a"
                            href={CALIBRATE_REPO_URL}
                            target="_blank"
                            rel="noreferrer"
                            color="inherit"
                            aria-label={t('nav.openRepoAria')}
                        >
                            <GitHubIcon />
                        </IconButton>
                    </Tooltip>

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

                    {showSettingsShortcut && (
                        <Tooltip title={t('nav.settings')}>
                            <IconButton
                                color="inherit"
                                onClick={() => navigate('/settings')}
                                aria-label={t('nav.openSettingsAria')}
                                sx={{ ml: 1 }}
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
        </Box>
    );
};

const Layout: React.FC = () => (
    <QuickAddFabProvider>
        <LayoutShell />
    </QuickAddFabProvider>
);

export default Layout;
