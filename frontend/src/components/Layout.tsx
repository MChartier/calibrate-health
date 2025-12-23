import React from 'react';
import {
    AppBar,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Divider,
    Drawer,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    useMediaQuery
} from '@mui/material';
import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';

const drawerWidth = 240;

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

                    <ListItemButton
                        selected={location.pathname.startsWith('/log')}
                        component={RouterLink}
                        to="/log"
                    >
                        <ListItemIcon>
                            <ListAltIcon />
                        </ListItemIcon>
                        <ListItemText primary="Log" />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/history')}
                        component={RouterLink}
                        to="/history"
                    >
                        <ListItemIcon>
                            <ShowChartIcon />
                        </ListItemIcon>
                        <ListItemText primary="History" />
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

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
                <Toolbar>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                            variant="h6"
                            component={RouterLink}
                            to="/log"
                            sx={{ color: 'inherit', textDecoration: 'none' }}
                        >
                            cal.io
                        </Typography>
                        {worktreeBadgeLabel && (
                            <Box
                                component="span"
                                sx={{
                                    border: '1px solid rgba(255, 255, 255, 0.5)',
                                    borderRadius: 1,
                                    px: 1,
                                    py: 0.25,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    lineHeight: 1,
                                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                    letterSpacing: '0.04em'
                                }}
                            >
                                {worktreeBadgeLabel}
                            </Box>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            {showAppNav && isDesktop && (
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
                <Box sx={{ p: 3, pb: showAppNav && !isDesktop ? 'calc(80px + env(safe-area-inset-bottom))' : 3 }}>
                    <Outlet />
                </Box>
            </Box>

            {showAppNav && !isDesktop && (
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
                        value={
                            location.pathname.startsWith('/dashboard')
                                ? '/dashboard'
                                : location.pathname.startsWith('/log')
                                  ? '/log'
                                  : location.pathname.startsWith('/history')
                                    ? '/history'
                                    : location.pathname.startsWith('/settings')
                                      ? '/settings'
                                      : null
                        }
                        onChange={(_, next) => {
                            if (typeof next === 'string') {
                                navigate(next);
                            }
                        }}
                    >
                        <BottomNavigationAction value="/dashboard" label="Dashboard" icon={<DashboardIcon />} />
                        <BottomNavigationAction value="/log" label="Log" icon={<ListAltIcon />} />
                        <BottomNavigationAction value="/history" label="History" icon={<ShowChartIcon />} />
                        <BottomNavigationAction value="/settings" label="Settings" icon={<SettingsIcon />} />
                    </BottomNavigation>
                </Box>
            )}
        </Box>
    );
};

export default Layout;
