import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    AppBar,
    Avatar,
    Badge,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Menu,
    MenuItem,
    Toolbar,
    Tooltip,
    Typography,
    useMediaQuery
} from '@mui/material';
import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import PersonIcon from '@mui/icons-material/PersonRounded';
import NotificationsIcon from '@mui/icons-material/NotificationsRounded';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { alpha, useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { QuickAddFabProvider } from '../context/QuickAddFabContext';
import { useQuickAddFab } from '../context/useQuickAddFab';
import AppPage from '../ui/AppPage';
import { getAvatarLabel } from '../utils/avatarLabel';
import { getTodayIsoDate } from '../utils/date';
import { useI18n } from '../i18n/useI18n';
import LogQuickAddFab from './LogQuickAddFab';
import InAppNotificationsDrawer from './InAppNotificationsDrawer';
import { useInAppNotificationBadge } from '../hooks/useInAppNotificationBadge';
import { type InAppNotification, inAppNotificationsQueryKey, useInAppNotificationsQuery } from '../queries/inAppNotifications';
import { isInAppNotificationsUpdatedMessage } from '../constants/notificationEvents';
import { useIncompleteTodayBadge } from '../hooks/useIncompleteTodayBadge';
import { useInstallState } from '../hooks/useInstallState';
import CalibrateLogo from './CalibrateLogo';
import LogDateNavigationCluster from './LogDateNavigationCluster';
import PwaStatusToasts from './PwaStatusToasts';
import { APP_TOOLBAR_HEIGHT_CSS_VAR } from '../ui/layoutCssVars';

const SAFE_AREA_INSET_TOP = 'var(--safe-area-inset-top, 0px)';
const SAFE_AREA_INSET_LEFT = 'var(--safe-area-inset-left, 0px)';
const SAFE_AREA_INSET_RIGHT = 'var(--safe-area-inset-right, 0px)';
const TITLEBAR_AREA_X = 'env(titlebar-area-x, 0px)';
const TITLEBAR_AREA_WIDTH = 'env(titlebar-area-width, 100vw)';
const TITLEBAR_AREA_RIGHT_INSET = `calc(100vw - ${TITLEBAR_AREA_X} - ${TITLEBAR_AREA_WIDTH})`; // Keeps toolbar actions clear of desktop PWA window controls.
const TOOLBAR_HORIZONTAL_PADDING_SPACING = { xs: 1.25, sm: 2.5 }; // Header gutter including safe-area insets.
const DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING = 7; // MUI default toolbar height in spacing units (56px).
const NAV_NOTIFICATION_BADGE_MAX = 99; // Prevent oversized badge strings from crowding the header controls.
const NAV_BRAND_WORDMARK_DISPLAY = { xs: 'none', sm: 'inline-flex' } as const; // Preserve xs toolbar room while keeping the logo visible.

/**
 * Normalize MUI toolbar min-heights into CSS length strings for safe-area math.
 */
function normalizeToolbarMinHeight(minHeight: number | string | undefined, fallback: string): string {
    if (typeof minHeight === 'number') return `${minHeight}px`;
    if (typeof minHeight === 'string' && minHeight.trim().length > 0) return minHeight;
    return fallback;
}

/**
 * Read the responsive toolbar heights once so the fixed AppBar, spacer, and page sizing vars stay aligned.
 */
function getToolbarMinHeights(theme: Theme) {
    const fallbackMinHeight = theme.spacing(DEFAULT_TOOLBAR_MIN_HEIGHT_SPACING);
    const baseMinHeight = normalizeToolbarMinHeight(theme.mixins.toolbar.minHeight, fallbackMinHeight);
    const toolbarMixins = theme.mixins.toolbar as Record<string, { minHeight?: number | string } | undefined>;
    const smMinHeight = normalizeToolbarMinHeight(toolbarMixins[theme.breakpoints.up('sm')]?.minHeight, baseMinHeight);

    return { baseMinHeight, smMinHeight };
}

/**
 * Build Toolbar sizing that includes safe-area padding so fixed headers and their spacers align.
 */
function buildSafeAreaToolbarSx(theme: Theme) {
    const { baseMinHeight, smMinHeight } = getToolbarMinHeights(theme);
    const leadingInset = `max(${SAFE_AREA_INSET_LEFT}, ${TITLEBAR_AREA_X})`;
    const trailingInset = `max(${SAFE_AREA_INSET_RIGHT}, ${TITLEBAR_AREA_RIGHT_INSET})`;

    return {
        pt: SAFE_AREA_INSET_TOP,
        pl: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.xs)} + ${leadingInset})`,
        pr: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.xs)} + ${trailingInset})`,
        minHeight: `calc(${baseMinHeight} + ${SAFE_AREA_INSET_TOP})`,
        [theme.breakpoints.up('sm')]: {
            minHeight: `calc(${smMinHeight} + ${SAFE_AREA_INSET_TOP})`,
            pl: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.sm)} + ${leadingInset})`,
            pr: `calc(${theme.spacing(TOOLBAR_HORIZONTAL_PADDING_SPACING.sm)} + ${trailingInset})`
        }
    };
}

/**
 * Publish the shell toolbar height for page-level viewport calculations.
 */
function buildAppShellSx(theme: Theme) {
    const { baseMinHeight, smMinHeight } = getToolbarMinHeights(theme);

    return {
        [APP_TOOLBAR_HEIGHT_CSS_VAR]: `calc(${baseMinHeight} + ${SAFE_AREA_INSET_TOP})`,
        minHeight: '100svh',
        width: '100%',
        bgcolor: 'background.default',
        [theme.breakpoints.up('sm')]: {
            [APP_TOOLBAR_HEIGHT_CSS_VAR]: `calc(${smMinHeight} + ${SAFE_AREA_INSET_TOP})`
        }
    };
}

const LayoutShell: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const queryClient = useQueryClient();
    const { dialogs, logDateNavigation, logDateOverride } = useQuickAddFab();
    const { t } = useI18n();
    const theme = useTheme();
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [profileMenuAnchor, setProfileMenuAnchor] = useState<HTMLElement | null>(null);
    const [isOpeningNotification, setIsOpeningNotification] = useState(false);
    const [dismissingNotificationId, setDismissingNotificationId] = useState<number | null>(null);
    const { isInstalled, canInstallPrompt, platformHint, showInstallCta, promptInstall } = useInstallState();
    useIncompleteTodayBadge();
    const safeAreaToolbarSx = useMemo(() => buildSafeAreaToolbarSx(theme), [theme]);
    const appShellSx = useMemo(() => buildAppShellSx(theme), [theme]);
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const isXs = useMediaQuery(theme.breakpoints.down('sm'));
    const navigate = useNavigate();
    const location = useLocation();
    const [isIosInstallDialogOpen, setIsIosInstallDialogOpen] = useState(false);

    const hideNav = location.pathname.startsWith('/onboarding');
    const showAppNav = Boolean(user) && !isLoading && !hideNav;
    const showAuthActions = !user && !isLoading;
    const isLoginRoute = location.pathname.startsWith('/login');
    const isRegisterRoute = location.pathname.startsWith('/register');
    const showLoginCta = showAuthActions && !isLoginRoute;
    const showRegisterCta = showAuthActions && !isRegisterRoute;
    const showNotificationsShortcut = showAppNav;
    const showInstallShortcut = showInstallCta && !hideNav && !(showAppNav && isXs);
    const authCtaSize = isDesktop ? 'medium' : 'small';
    const registerCtaLabel = isDesktop ? t('auth.createAccount') : t('auth.register');
    const today = useMemo(() => getTodayIsoDate(user?.timezone), [user?.timezone]);
    const inAppNotificationsQuery = useInAppNotificationsQuery({ enabled: showAppNav });
    const inAppNotifications = inAppNotificationsQuery.data?.notifications ?? [];
    const unreadNotificationCount = inAppNotificationsQuery.data?.unreadCount ?? 0;
    const hasLoadedNotificationCount = inAppNotificationsQuery.status !== 'pending';
    const refetchInAppNotifications = inAppNotificationsQuery.refetch;

    useInAppNotificationBadge({
        enabled: showAppNav,
        unreadCount: unreadNotificationCount,
        hasLoadedCount: hasLoadedNotificationCount
    });

    useEffect(() => {
        if (!showAppNav || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        const handleServiceWorkerMessage = (event: MessageEvent) => {
            if (!isInAppNotificationsUpdatedMessage(event.data)) {
                return;
            }

            void queryClient.invalidateQueries({ queryKey: inAppNotificationsQueryKey() });
        };

        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        return () => {
            navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        };
    }, [queryClient, showAppNav]);

    const handleLogout = async () => {
        await logout();
        setProfileMenuAnchor(null);
        navigate('/');
    };

    const handleOpenNotifications = useCallback(() => {
        setNotificationsOpen(true);
    }, []);

    const handleCloseNotifications = useCallback(() => {
        setNotificationsOpen(false);
    }, []);

    const handleRetryNotifications = useCallback(() => {
        void refetchInAppNotifications();
    }, [refetchInAppNotifications]);

    const handleOpenNotification = useCallback(
        async (notification: InAppNotification) => {
            setIsOpeningNotification(true);
            try {
                setNotificationsOpen(false);
                navigate(notification.action_url);
            } catch (error) {
                console.error(error);
            } finally {
                setIsOpeningNotification(false);
                void refetchInAppNotifications();
            }
        },
        [navigate, refetchInAppNotifications]
    );

    const handleDismissNotification = useCallback(
        async (notification: InAppNotification) => {
            setDismissingNotificationId(notification.id);
            try {
                await axios.patch(`/api/notifications/in-app/${notification.id}/dismiss`);
            } catch (error) {
                console.error(error);
            } finally {
                setDismissingNotificationId(null);
                void refetchInAppNotifications();
            }
        },
        [refetchInAppNotifications]
    );

    const fabDate = logDateOverride ?? today;
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

    const brandHomePath = user ? '/dashboard' : '/';

    return (
        <Box sx={appShellSx}>
            <AppBar position="fixed">
                <Toolbar
                    sx={[
                        safeAreaToolbarSx,
                        {
                            display: 'grid',
                            gridTemplateColumns: {
                                xs: 'auto minmax(0, 1fr) auto',
                                sm: 'minmax(0, 1fr) auto minmax(0, 1fr)'
                            },
                            gridTemplateAreas: {
                                xs: '"brand spacer actions"',
                                sm: '"brand date actions"'
                            },
                            columnGap: { xs: 0.75, sm: 1.25 },
                            alignItems: 'center',
                            WebkitAppRegion: 'drag'
                        }
                    ]}
                >
                    <Box
                        component={RouterLink}
                        to={brandHomePath}
                        aria-label={t('app.brand')}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            color: 'inherit',
                            textDecoration: 'none',
                            flexShrink: 0,
                            minWidth: 0,
                            justifySelf: 'start',
                            gridArea: 'brand',
                            WebkitAppRegion: 'no-drag'
                        }}
                    >
                        <CalibrateLogo showWordmark={false} size={34} />
                        <Box sx={{ display: NAV_BRAND_WORDMARK_DISPLAY }}>
                            <CalibrateLogo showWordmark size={0} />
                        </Box>
                    </Box>

                    {showAppNav && logDateNavigation && (
                        <LogDateNavigationCluster
                            navigation={logDateNavigation}
                            placement="navbar"
                            showTodayShortcut
                            sx={{
                                display: { xs: 'none', sm: 'inline-flex' },
                                justifySelf: 'center',
                                gridArea: 'date',
                                WebkitAppRegion: 'no-drag'
                            }}
                        />
                    )}

                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexShrink: 0,
                            justifySelf: 'end',
                            gridArea: 'actions',
                            WebkitAppRegion: 'no-drag'
                        }}
                    >
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

                        {showNotificationsShortcut && (
                            <Tooltip title={t('nav.notifications')}>
                                <IconButton
                                    color="inherit"
                                    onClick={handleOpenNotifications}
                                    aria-label={t('nav.openNotificationsAria')}
                                >
                                    <Badge
                                        color="error"
                                        badgeContent={unreadNotificationCount}
                                        max={NAV_NOTIFICATION_BADGE_MAX}
                                        invisible={unreadNotificationCount <= 0}
                                    >
                                        <NotificationsIcon />
                                    </Badge>
                                </IconButton>
                            </Tooltip>
                        )}

                        {showInstallShortcut && (
                            <Tooltip title={t('nav.install')}>
                                {isXs ? (
                                    <IconButton color="inherit" aria-label={t('nav.openInstallAria')} onClick={handleInstallClick}>
                                        <DownloadRoundedIcon fontSize="small" />
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

                        {showAppNav && (
                            <>
                                <Tooltip title={t('nav.accountMenu')}>
                                    <IconButton
                                        color="inherit"
                                        onClick={(event) => setProfileMenuAnchor(event.currentTarget)}
                                        aria-label={t('nav.accountMenu')}
                                        aria-controls={profileMenuAnchor ? 'account-menu' : undefined}
                                        aria-haspopup="menu"
                                        aria-expanded={profileMenuAnchor ? 'true' : undefined}
                                        sx={{ gap: 0.25, px: 0.5 }}
                                    >
                                        <Avatar
                                            src={user?.profile_image_url ?? undefined}
                                            sx={{
                                                width: 32,
                                                height: 32,
                                                bgcolor: (theme) =>
                                                    alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.12),
                                                color: 'text.primary',
                                                fontWeight: 900
                                            }}
                                        >
                                            {getAvatarLabel(user?.email)}
                                        </Avatar>
                                        <KeyboardArrowDownRoundedIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Menu
                                    id="account-menu"
                                    anchorEl={profileMenuAnchor}
                                    open={Boolean(profileMenuAnchor)}
                                    onClose={() => setProfileMenuAnchor(null)}
                                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                >
                                    <MenuItem
                                        onClick={() => {
                                            setProfileMenuAnchor(null);
                                            navigate('/profile');
                                        }}
                                    >
                                        <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                                        {t('nav.profile')}
                                    </MenuItem>
                                    <MenuItem
                                        onClick={() => {
                                            setProfileMenuAnchor(null);
                                            navigate('/settings');
                                        }}
                                    >
                                        <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
                                        {t('nav.settings')}
                                    </MenuItem>
                                    <MenuItem onClick={() => void handleLogout()}>
                                        <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
                                        {t('nav.logOut')}
                                    </MenuItem>
                                </Menu>
                            </>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>

            <Box component="main" sx={{ minWidth: 0, minHeight: '100svh', bgcolor: 'background.default' }}>
                <Toolbar sx={safeAreaToolbarSx} />
                <AppPage>
                    <Outlet />
                </AppPage>
            </Box>

            {showAppNav && (
                <InAppNotificationsDrawer
                    open={notificationsOpen}
                    notifications={inAppNotifications}
                    unreadCount={unreadNotificationCount}
                    isLoading={inAppNotificationsQuery.isLoading}
                    isError={inAppNotificationsQuery.isError}
                    isOpeningNotification={isOpeningNotification}
                    dismissingNotificationId={dismissingNotificationId}
                    onClose={handleCloseNotifications}
                    onRetry={handleRetryNotifications}
                    onOpenNotification={handleOpenNotification}
                    onDismissNotification={handleDismissNotification}
                />
            )}

            {showAppNav && <LogQuickAddFab date={fabDate} />}
            <PwaStatusToasts />

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
