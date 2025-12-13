import React, { useEffect, useState } from 'react';
import {
    AppBar,
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
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
import { useAuth } from '../context/AuthContext';

const drawerWidth = 240;

const Layout: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const showDrawer = Boolean(user) && !isLoading;

    useEffect(() => {
        if (!showDrawer || isDesktop) setMobileDrawerOpen(false);
    }, [isDesktop, showDrawer]);

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
                            selected={location.pathname.startsWith('/history')}
                            onClick={() => handleNavigate('/history')}
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

                    <Typography
                        variant="h6"
                        component={RouterLink}
                        to="/dashboard"
                        sx={{ color: 'inherit', textDecoration: 'none' }}
                    >
                        cal-io
                    </Typography>
                </Toolbar>
            </AppBar>

            {showDrawer && (
                <>
                    <Drawer
                        variant="temporary"
                        open={mobileDrawerOpen}
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

            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <Toolbar />
                <Outlet />
            </Box>
        </Box>
    );
};

export default Layout;
