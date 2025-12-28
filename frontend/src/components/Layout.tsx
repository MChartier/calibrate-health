import React from 'react';
import {
    AppBar,
    Avatar,
    Box,
    BottomNavigation,
    BottomNavigationAction,
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
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import AppPage from '../ui/AppPage';
import { getAvatarLabel } from '../utils/avatarLabel';

const drawerWidth = 240;

/**
 * Map the current pathname to a navigation value so nested routes keep the correct tab highlighted.
 */
function getActiveNavigationValue(pathname: string): string | null {
    if (pathname.startsWith('/dashboard')) return '/dashboard';
    if (pathname.startsWith('/log')) return '/log';
    if (pathname.startsWith('/goals')) return '/goals';
    if (pathname.startsWith('/settings')) return '/settings';
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
    const showProfileShortcut = Boolean(user) && !isLoading && !hideNav;
    const showDrawer = showAppNav && isDesktop;
    const showBottomNav = showAppNav && !isDesktop;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
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
                            to="/dashboard"
                            sx={{ color: 'inherit', textDecoration: 'none' }}
                        >
                            cal.io
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

                    {showProfileShortcut && (
                        <Tooltip title="Profile">
                            <IconButton
                                color="inherit"
                                onClick={() => navigate('/profile')}
                                aria-label="Open profile"
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
                        <BottomNavigationAction value="/settings" label="Settings" icon={<SettingsIcon />} />
                    </BottomNavigation>
                </Box>
            )}
        </Box>
    );
};

export default Layout;
