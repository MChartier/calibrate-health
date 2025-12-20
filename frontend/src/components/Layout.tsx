import React, { useState } from 'react';
import {
    AppBar,
    Avatar,
    Box,
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
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';

const drawerWidth = 240;

/**
 * Derive a short, stable label for the user's Avatar when we don't have a profile image.
 */
function getAvatarLabel(email?: string) {
    const trimmed = email?.trim();
    if (!trimmed) return '?';
    return trimmed[0].toUpperCase();
}

const Layout: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const worktreeName = import.meta.env.VITE_WORKTREE_NAME?.trim();
    const isMainWorktree = import.meta.env.VITE_WORKTREE_IS_MAIN === 'true';
    const worktreeBadgeLabel = worktreeName && !isMainWorktree ? worktreeName : null;

    const hideNav = location.pathname.startsWith('/onboarding');
    const showDrawer = Boolean(user) && !isLoading && !hideNav;

    const handleMenuClick = () => {
        if (!showDrawer || isDesktop) return;
        setMobileDrawerOpen((open) => !open);
    };

    const handleNavigate = (path: string) => {
        navigate(path);
        if (!isDesktop) {
            setMobileDrawerOpen(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        setMobileDrawerOpen(false);
        navigate('/login');
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Toolbar />

            <Box sx={{ flexGrow: 1 }}>
                <List>
                    <ListItemButton
                        selected={location.pathname.startsWith('/dashboard')}
                        onClick={() => handleNavigate('/dashboard')}
                    >
                        <ListItemIcon>
                            <DashboardIcon />
                        </ListItemIcon>
                        <ListItemText primary="Dashboard" />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/log')}
                        onClick={() => handleNavigate('/log')}
                    >
                        <ListItemIcon>
                            <ListAltIcon />
                        </ListItemIcon>
                        <ListItemText primary="Log" />
                    </ListItemButton>

                    <ListItemButton
                        selected={location.pathname.startsWith('/goals')}
                        onClick={() => handleNavigate('/goals')}
                    >
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
                    onClick={() => handleNavigate('/settings')}
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
                    {showDrawer && !isDesktop && (
                        <IconButton color="inherit" edge="start" onClick={handleMenuClick} sx={{ mr: 2 }}>
                            <MenuIcon />
                        </IconButton>
                    )}

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

                    <Box sx={{ flexGrow: 1 }} />

                    {user && !isLoading && (
                        <Tooltip title="Profile">
                            <IconButton
                                color="inherit"
                                onClick={() => handleNavigate('/profile')}
                                aria-label="Open profile"
                                sx={{ ml: 1 }}
                            >
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: 'rgba(255, 255, 255, 0.2)',
                                        color: 'inherit',
                                        fontWeight: 700
                                    }}
                                >
                                    {getAvatarLabel(user.email)}
                                </Avatar>
                            </IconButton>
                        </Tooltip>
                    )}
                </Toolbar>
            </AppBar>

            {showDrawer && (
                <>
                    <Drawer
                        variant="temporary"
                        open={mobileDrawerOpen && !isDesktop}
                        onClose={() => setMobileDrawerOpen(false)}
                        ModalProps={{ keepMounted: true }}
                        sx={{
                            display: { xs: 'block', md: 'none' },
                            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
                        }}
                    >
                        {drawerContent}
                    </Drawer>

                    <Drawer
                        variant="permanent"
                        sx={{
                            display: { xs: 'none', md: 'block' },
                            width: drawerWidth,
                            flexShrink: 0,
                            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
                        }}
                    >
                        {drawerContent}
                    </Drawer>
                </>
            )}

            <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                <Toolbar />
                <Box sx={{ p: 3 }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default Layout;
