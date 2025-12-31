import React from 'react';
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
import { useAuth } from '../context/useAuth';
import AppPage from '../ui/AppPage';
import { getAvatarLabel } from '../utils/avatarLabel';

const drawerWidth = 240;
const GITHUB_REPO_URL = 'https://github.com/MChartier/cal-io';

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

const Layout: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const theme = useTheme();
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
    const registerCtaLabel = isDesktop ? 'Create account' : 'Register';

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />

            <Box sx={{ flexGrow: 1 }}>
                <List>
                    <ListItemButton
                        selected={location.pathname.startsWith('/dashboard')}
                        component={RouterLink}
                        to="/dashboard"
                    >
                        <ListItemIcon>
                            <DashboardIcon />
                        </ListItemIcon>
                        <ListItemText primary="Dashboard" />
                    </ListItemButton>

                    <ListItemButton selected={location.pathname.startsWith('/log')} component={RouterLink} to="/log">
                        <ListItemIcon>
                            <ListAltIcon />
                        </ListItemIcon>
                        <ListItemText primary="Log" />
                    </ListItemButton>

                    <ListItemButton selected={location.pathname.startsWith('/goals')} component={RouterLink} to="/goals">
                        <ListItemIcon>
                            <ShowChartIcon />
                        </ListItemIcon>
                        <ListItemText primary="Goals" />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/profile')}
                        component={RouterLink}
                        to="/profile"
                    >
                        <ListItemIcon>
                            <PersonIcon />
                        </ListItemIcon>
                        <ListItemText primary="Profile" />
                    </ListItemButton>
                </List>
            </Box>

            <Divider />

            <List>
                <ListItemButton
                    selected={location.pathname.startsWith('/settings')}
                    component={RouterLink}
                    to="/settings"
                >
                    <ListItemIcon>
                        <SettingsIcon />
                    </ListItemIcon>
                    <ListItemText primary="Settings" />
                </ListItemButton>

                <ListItemButton onClick={handleLogout}>
                    <ListItemIcon>
                        <LogoutIcon />
                    </ListItemIcon>
                    <ListItemText primary="Log out" />
                </ListItemButton>
            </List>
        </Box>
    );

    const navigationValue = getActiveNavigationValue(location.pathname);

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
                <Toolbar>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                            variant="h6"
                            component={RouterLink}
                            to={user ? '/dashboard' : '/'}
                            sx={{ color: 'inherit', textDecoration: 'none' }}
                        >
                            calibrate
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

                    <Tooltip title="GitHub">
                        <IconButton
                            component="a"
                            href={GITHUB_REPO_URL}
                            target="_blank"
                            rel="noreferrer"
                            color="inherit"
                            aria-label="Open the source repository on GitHub"
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
                                    Sign in
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
                        <Tooltip title="Settings">
                            <IconButton
                                color="inherit"
                                onClick={() => navigate('/settings')}
                                aria-label="Open settings"
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
                <Toolbar />
                <AppPage fullBleedOnXs={showBottomNav} reserveBottomNavSpace={showBottomNav}>
                    <Outlet />
                </AppPage>
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
                        pb: 'env(safe-area-inset-bottom)',
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
                        <BottomNavigationAction value="/dashboard" label="Dashboard" icon={<DashboardIcon />} />
                        <BottomNavigationAction value="/log" label="Log" icon={<ListAltIcon />} />
                        <BottomNavigationAction value="/goals" label="Goals" icon={<ShowChartIcon />} />
                        <BottomNavigationAction value="/profile" label="Profile" icon={<PersonIcon />} />
                    </BottomNavigation>
                </Box>
            )}
        </Box>
    );
};

export default Layout;
