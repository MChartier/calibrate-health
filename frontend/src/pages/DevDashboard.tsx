import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Divider,
    FormControlLabel,
    FormGroup,
    Grid,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import axios from 'axios';
import BarcodeScannerDialog from '../components/BarcodeScannerDialog';
import { clearAppBadge, isBadgingSupported, setAppBadge } from '../utils/badging';
import { resolveServiceWorkerRegistration, urlBase64ToUint8Array } from '../utils/pushNotifications';
import { NOTIFICATION_DELIVERY_CHANNELS, type NotificationDeliveryChannel } from '../../../shared/notificationDelivery';

type FoodDataSource = 'fatsecret' | 'usda' | 'openFoodFacts';

type FoodMeasure = {
    label: string;
    gramWeight?: number;
    quantity?: number;
    unit?: string;
};

type NormalizedFoodItem = {
    id: string;
    source: FoodDataSource;
    description: string;
    brand?: string;
    barcode?: string;
    locale?: string;
    availableMeasures: FoodMeasure[];
    nutrientsPer100g?: {
        calories: number;
        protein?: number;
        fat?: number;
        carbs?: number;
    };
};

type FoodProviderInfo = {
    name: FoodDataSource;
    label: string;
    supportsBarcodeLookup: boolean;
    ready: boolean;
    detail?: string;
};

type ProviderSearchResult = FoodProviderInfo & {
    items: NormalizedFoodItem[];
    error?: string;
    elapsedMs?: number;
};

type ResetTestUserOnboardingResponse = {
    ok: boolean;
    user: { email?: string } | null;
};

type DevNotificationDeliveryResponse = {
    ok?: boolean;
    partial?: boolean;
    channels?: NotificationDeliveryChannel[];
    push?: {
        sent?: number;
        failed?: number;
        skipped?: boolean;
        message?: string;
    };
    in_app?: {
        created?: number;
        skipped?: boolean;
        message?: string;
    };
};

/**
 * Dev-only dashboard to compare food search results side-by-side across providers.
 */
const DevDashboard: React.FC = () => {
    const [providers, setProviders] = useState<FoodProviderInfo[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<FoodDataSource[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProviderSearchResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [resetError, setResetError] = useState<string | null>(null);
    const [resetSuccess, setResetSuccess] = useState<string | null>(null);
    const [isResettingTestUser, setIsResettingTestUser] = useState(false);

    const [pushError, setPushError] = useState<string | null>(null);
    const [pushStatus, setPushStatus] = useState<string | null>(null);
    const [isPreparingPush, setIsPreparingPush] = useState(false);
    const [isSendingPush, setIsSendingPush] = useState(false);
    const [hasPushSubscription, setHasPushSubscription] = useState(false);
    const [activePushEndpoint, setActivePushEndpoint] = useState<string | null>(null);
    const [deliverViaPush, setDeliverViaPush] = useState(true);
    const [deliverViaInApp, setDeliverViaInApp] = useState(true);
    const [badgeStatus, setBadgeStatus] = useState<string | null>(null);
    const [badgeError, setBadgeError] = useState<string | null>(null);

    const notificationPermission =
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    const supportsServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in navigator;
    const supportsPushManager = typeof window !== 'undefined' && 'PushManager' in window;
    const supportsBadging = isBadgingSupported();
    const selectedDeliveryChannels = useMemo<NotificationDeliveryChannel[]>(() => {
        const channels: NotificationDeliveryChannel[] = [];
        if (deliverViaPush) {
            channels.push(NOTIFICATION_DELIVERY_CHANNELS.PUSH);
        }
        if (deliverViaInApp) {
            channels.push(NOTIFICATION_DELIVERY_CHANNELS.IN_APP);
        }
        return channels;
    }, [deliverViaInApp, deliverViaPush]);

    /**
     * Fetch provider metadata so the UI reflects current backend configuration.
     */
    const loadProviders = useCallback(async () => {
        setIsLoadingProviders(true);
        setError(null);
        try {
            const response = await axios.get('/api/dev/food/providers');
            const fetched: FoodProviderInfo[] = Array.isArray(response.data?.providers) ? response.data.providers : [];
            setProviders(fetched);
            setSelectedProviders((current) => {
                if (current.length > 0) {
                    return current;
                }
                return fetched.filter((provider) => provider.ready).map((provider) => provider.name);
            });
        } catch (err) {
            console.error(err);
            setError('Unable to load provider metadata.');
        } finally {
            setIsLoadingProviders(false);
        }
    }, []);

    useEffect(() => {
        void loadProviders();
    }, [loadProviders]);

    /**
     * Check the active push subscription so the UI can reflect current status.
     */
    const loadPushSubscriptionStatus = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setHasPushSubscription(false);
            setActivePushEndpoint(null);
            return;
        }

        try {
            const registration = await resolveServiceWorkerRegistration();
            if (!registration) {
                setHasPushSubscription(false);
                setActivePushEndpoint(null);
                return;
            }
            const subscription = await registration.pushManager.getSubscription();
            setHasPushSubscription(Boolean(subscription));
            setActivePushEndpoint(subscription?.endpoint ?? null);
        } catch (err) {
            console.error(err);
            setHasPushSubscription(false);
            setActivePushEndpoint(null);
        }
    }, []);

    useEffect(() => {
        void loadPushSubscriptionStatus();
    }, [loadPushSubscriptionStatus]);

    /**
     * Toggle providers while keeping the selection array stable for requests.
     */
    const toggleProvider = (name: FoodDataSource) => {
        setSelectedProviders((current) =>
            current.includes(name) ? current.filter((provider) => provider !== name) : [...current, name]
        );
    };

    /**
     * Build a compact metadata line to scan calories and branding quickly.
     */
    const buildItemDetails = (item: NormalizedFoodItem): string => {
        const details: string[] = [];
        if (item.brand) {
            details.push(`Brand: ${item.brand}`);
        }
        if (item.nutrientsPer100g?.calories !== undefined) {
            details.push(`${item.nutrientsPer100g.calories} kcal/100g`);
        } else {
            details.push('Calories: n/a');
        }
        if (item.barcode) {
            details.push(`UPC: ${item.barcode}`);
        }
        if (item.locale) {
            details.push(`Locale: ${item.locale}`);
        }
        if (item.availableMeasures.length > 0) {
            details.push(`${item.availableMeasures.length} measures`);
        }
        return details.length > 0 ? details.join(' | ') : 'No metadata available';
    };

    /**
     * Reset the deterministic dev test user back to a pre-onboarding state.
     */
    const handleResetTestUserOnboarding = useCallback(async () => {
        setResetError(null);
        setResetSuccess(null);
        setIsResettingTestUser(true);

        try {
            const response = await axios.post<ResetTestUserOnboardingResponse>('/dev/test/reset-test-user-onboarding');
            const email = response.data?.user?.email ?? 'test@calibratehealth.app';
            setResetSuccess(`Reset complete for ${email}. Navigate to /onboarding (or refresh a protected page) to re-test onboarding.`);
        } catch (err) {
            console.error(err);
            const serverMessage = axios.isAxiosError(err)
                ? (err.response?.data as { message?: unknown } | undefined)?.message
                : null;
            setResetError(typeof serverMessage === 'string' && serverMessage.trim().length > 0 ? serverMessage : 'Reset failed.');
        } finally {
            setIsResettingTestUser(false);
        }
    }, []);

    /**
     * Subscribe the current browser to push notifications and persist the subscription.
     */
    const handleRegisterPush = useCallback(async () => {
        setPushError(null);
        setPushStatus(null);

        if (!('Notification' in window)) {
            setPushError('Notifications are not supported in this browser.');
            return;
        }
        if (!('serviceWorker' in navigator)) {
            setPushError('Service workers are not supported in this browser.');
            return;
        }
        if (!('PushManager' in window)) {
            setPushError('Push messaging is not supported in this browser.');
            return;
        }

        setIsPreparingPush(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setPushError('Notification permission was not granted.');
                return;
            }

            const registration = await resolveServiceWorkerRegistration();
            if (!registration) {
                setPushError(
                    'No active service worker registration found. Enable the PWA service worker (VITE_ENABLE_SW_DEV=1) or use a production/preview build.'
                );
                return;
            }

            const keyResponse = await axios.get('/api/notifications/public-key');
            const publicKey = keyResponse.data?.publicKey;
            if (!publicKey || typeof publicKey !== 'string') {
                setPushError('Missing VAPID public key from the backend.');
                return;
            }

            const existingSubscription = await registration.pushManager.getSubscription();
            const subscription =
                existingSubscription ??
                (await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                }));
            const endpoint = subscription.endpoint.trim();
            if (!endpoint) {
                setPushError('Push subscription endpoint is missing.');
                return;
            }

            await axios.post('/api/notifications/subscription', subscription.toJSON());
            setHasPushSubscription(true);
            setActivePushEndpoint(endpoint);
            setPushStatus('Push subscription saved. You can send a test notification.');
        } catch (err) {
            console.error(err);
            const serverMessage = axios.isAxiosError(err)
                ? (err.response?.data as { message?: unknown } | undefined)?.message
                : null;
            setPushError(
                typeof serverMessage === 'string' && serverMessage.trim().length > 0
                    ? serverMessage
                    : 'Failed to register push subscription.'
            );
        } finally {
            setIsPreparingPush(false);
            void loadPushSubscriptionStatus();
        }
    }, [loadPushSubscriptionStatus]);

    /**
     * Build a concise summary string from channel-level backend delivery results.
     */
    const formatDeliveryStatus = useCallback(
        (baseMessage: string, response: DevNotificationDeliveryResponse, channels: NotificationDeliveryChannel[]): string => {
            const statusParts = [baseMessage];

            if (channels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH)) {
                const sent = typeof response.push?.sent === 'number' ? response.push.sent : 0;
                const failed = typeof response.push?.failed === 'number' ? response.push.failed : 0;
                statusParts.push(`Push sent ${sent}${failed > 0 ? ` (failed ${failed})` : ''}.`);
            }

            if (channels.includes(NOTIFICATION_DELIVERY_CHANNELS.IN_APP)) {
                const created = typeof response.in_app?.created === 'number' ? response.in_app.created : 0;
                statusParts.push(`In-app created ${created}.`);
            }

            return statusParts.join(' ');
        },
        []
    );

    /**
     * Send a basic test notification to validate delivery and click handling.
     */
    const sendDevNotification = useCallback(async (path: string, successMessage: string, errorMessage: string) => {
        setPushError(null);
        setPushStatus(null);
        if (selectedDeliveryChannels.length === 0) {
            setPushError('Select at least one delivery channel.');
            return;
        }

        const requiresPushEndpoint = selectedDeliveryChannels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH);
        if (requiresPushEndpoint && !activePushEndpoint) {
            setPushError('No active push subscription found for this browser endpoint.');
            return;
        }

        setIsSendingPush(true);
        try {
            const requestBody: { channels: NotificationDeliveryChannel[]; endpoint?: string } = {
                channels: selectedDeliveryChannels
            };
            if (requiresPushEndpoint && activePushEndpoint) {
                requestBody.endpoint = activePushEndpoint;
            }

            const response = await axios.post<DevNotificationDeliveryResponse>(path, requestBody);
            const responseData = response.data ?? {};
            if (responseData.ok === false && !responseData.partial) {
                const pushMessage = typeof responseData.push?.message === 'string' ? responseData.push.message : null;
                const inAppMessage =
                    typeof responseData.in_app?.message === 'string' ? responseData.in_app.message : null;
                setPushError(pushMessage || inAppMessage || errorMessage);
                return;
            }

            const statusPrefix = responseData.partial ? `Partial delivery. ${successMessage}` : successMessage;
            setPushStatus(formatDeliveryStatus(statusPrefix, responseData, selectedDeliveryChannels));
        } catch (err) {
            console.error(err);
            const serverMessage = axios.isAxiosError(err)
                ? (err.response?.data as { message?: unknown } | undefined)?.message
                : null;
            setPushError(
                typeof serverMessage === 'string' && serverMessage.trim().length > 0 ? serverMessage : errorMessage
            );
        } finally {
            setIsSendingPush(false);
        }
    }, [activePushEndpoint, formatDeliveryStatus, selectedDeliveryChannels]);

    const handleSendTestNotification = useCallback(() => {
        return sendDevNotification(
            '/api/dev/notifications/test',
            'Test notification sent.',
            'Failed to send test notification.'
        );
    }, [sendDevNotification]);

    const handleSendLogWeightNotification = useCallback(() => {
        return sendDevNotification(
            '/api/dev/notifications/log-weight',
            'Log weight notification sent.',
            'Failed to send log weight notification.'
        );
    }, [sendDevNotification]);

    const handleSendLogFoodNotification = useCallback(() => {
        return sendDevNotification(
            '/api/dev/notifications/log-food',
            'Log food notification sent.',
            'Failed to send log food notification.'
        );
    }, [sendDevNotification]);

    const handleSetBadge = useCallback(async (count: number) => {
        setBadgeError(null);
        setBadgeStatus(null);

        try {
            const ok = await setAppBadge(count);
            if (!ok) {
                setBadgeError('Badging API is not supported on this platform.');
                return;
            }
            setBadgeStatus(`Badge set to ${count}.`);
        } catch (err) {
            console.error(err);
            setBadgeError('Failed to set the app badge.');
        }
    }, []);

    const handleClearBadge = useCallback(async () => {
        setBadgeError(null);
        setBadgeStatus(null);

        try {
            const ok = await clearAppBadge();
            if (!ok) {
                setBadgeError('Badging API is not supported on this platform.');
                return;
            }
            setBadgeStatus('Badge cleared.');
        } catch (err) {
            console.error(err);
            setBadgeError('Failed to clear the app badge.');
        }
    }, []);

    /**
     * Run a search against the selected providers using either a free-text query or a UPC/EAN barcode.
     */
    const runSearch = useCallback(
        async (params: { q?: string; barcode?: string }) => {
            if (!params.q && !params.barcode) {
                setError('Enter a search query or scan a barcode.');
                return;
            }

            if (selectedProviders.length === 0) {
                setError('Select at least one provider.');
                return;
            }

            setIsSearching(true);
            setError(null);
            try {
                const response = await axios.get('/api/dev/food/search', {
                    params: {
                        ...params,
                        providers: selectedProviders.join(',')
                    }
                });
                const fetched: ProviderSearchResult[] = Array.isArray(response.data?.results) ? response.data.results : [];
                setResults(fetched);
            } catch (err) {
                console.error(err);
                setError('Search failed. Please try again.');
            } finally {
                setIsSearching(false);
            }
        },
        [selectedProviders]
    );

    /**
     * Execute a query against the selected providers for easy side-by-side comparison.
     */
    const handleSearch = async () => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            setError('Enter a search query to compare providers, or scan a barcode.');
            return;
        }

        await runSearch({ q: trimmedQuery });
    };

    const pushChannelSelected = selectedDeliveryChannels.includes(NOTIFICATION_DELIVERY_CHANNELS.PUSH);
    const hasSelectedDeliveryChannels = selectedDeliveryChannels.length > 0;
    const canSendDevNotifications =
        hasSelectedDeliveryChannels && !isSendingPush && (!pushChannelSelected || Boolean(activePushEndpoint));
    const clearPushMessages = () => {
        setPushError(null);
        setPushStatus(null);
    };
    // Keep the card's high-level flow readable by collapsing button row details into named blocks.
    const pushPrimaryActions = (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button variant="contained" onClick={() => void handleRegisterPush()} disabled={isPreparingPush}>
                {isPreparingPush ? 'Registering...' : 'Register push subscription'}
            </Button>
            <Button
                variant="outlined"
                onClick={() => void handleSendTestNotification()}
                disabled={!canSendDevNotifications}
            >
                {isSendingPush ? 'Sending...' : 'Send test notification'}
            </Button>
            <Button variant="text" onClick={clearPushMessages} disabled={isPreparingPush || isSendingPush}>
                Clear message
            </Button>
        </Stack>
    );
    const pushReminderActions = (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
                variant="outlined"
                onClick={() => void handleSendLogWeightNotification()}
                disabled={!canSendDevNotifications}
            >
                {isSendingPush ? 'Sending...' : 'Send log weight notification'}
            </Button>
            <Button
                variant="outlined"
                onClick={() => void handleSendLogFoodNotification()}
                disabled={!canSendDevNotifications}
            >
                {isSendingPush ? 'Sending...' : 'Send log food notification'}
            </Button>
        </Stack>
    );

    return (
        <Box>
            <Stack spacing={1} sx={{ mb: 3 }}>
                <Typography variant="body1" color="text.secondary">
                    Compare search output across providers to tune query quality.
                </Typography>
            </Stack>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>
                                Test user tools
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Reset the seeded dev account back to a pre-onboarding state (clears profile fields, goals,
                                metrics, and food logs) without changing your session.
                            </Typography>
                        </Box>

                        {resetError && <Alert severity="error">{resetError}</Alert>}
                        {resetSuccess && <Alert severity="success">{resetSuccess}</Alert>}

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Button
                                variant="contained"
                                color="warning"
                                onClick={() => void handleResetTestUserOnboarding()}
                                disabled={isResettingTestUser}
                            >
                                {isResettingTestUser ? 'Resetting…' : 'Reset onboarding state'}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={() => {
                                    setResetError(null);
                                    setResetSuccess(null);
                                }}
                                disabled={isResettingTestUser}
                            >
                                Clear message
                            </Button>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>
                                App badge
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Set or clear the app badge to validate Badging API support.
                            </Typography>
                        </Box>

                        {!supportsBadging && (
                            <Alert severity="warning">Badging API is not supported on this platform.</Alert>
                        )}

                        {badgeError && <Alert severity="error">{badgeError}</Alert>}
                        {badgeStatus && <Alert severity="success">{badgeStatus}</Alert>}

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Button
                                variant="outlined"
                                onClick={() => void handleSetBadge(1)}
                                disabled={!supportsBadging}
                            >
                                Set badge to 1
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={() => void handleClearBadge()}
                                disabled={!supportsBadging}
                            >
                                Clear badge
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => {
                                    setBadgeError(null);
                                    setBadgeStatus(null);
                                }}
                                disabled={!supportsBadging}
                            >
                                Clear message
                            </Button>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>
                                Notifications
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Register a push subscription, then choose push and/or in-app delivery for each dev send.
                            </Typography>
                        </Box>

                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">
                                Notifications permission: {notificationPermission}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Service worker: {supportsServiceWorker ? 'supported' : 'unsupported'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                PushManager: {supportsPushManager ? 'supported' : 'unsupported'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Subscription: {hasPushSubscription ? 'active' : 'none'}
                            </Typography>
                        </Stack>

                        <FormGroup row>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={deliverViaPush}
                                        onChange={(event) => setDeliverViaPush(event.target.checked)}
                                    />
                                }
                                label="Deliver via push"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={deliverViaInApp}
                                        onChange={(event) => setDeliverViaInApp(event.target.checked)}
                                    />
                                }
                                label="Deliver via in-app"
                            />
                        </FormGroup>

                        {!hasSelectedDeliveryChannels && (
                            <Alert severity="warning">Select at least one delivery channel before sending.</Alert>
                        )}

                        {pushChannelSelected && !activePushEndpoint && (
                            <Alert severity="warning">
                                Push delivery is selected, but this browser has no active subscription endpoint.
                            </Alert>
                        )}

                        {pushError && <Alert severity="error">{pushError}</Alert>}
                        {pushStatus && <Alert severity="success">{pushStatus}</Alert>}

                        <Stack spacing={2}>
                            {pushPrimaryActions}
                            {pushReminderActions}
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>
                                Providers
                            </Typography>
                            <FormGroup row>
                                {providers.map((provider) => (
                                    <FormControlLabel
                                        key={provider.name}
                                        control={
                                            <Checkbox
                                                checked={selectedProviders.includes(provider.name)}
                                                onChange={() => toggleProvider(provider.name)}
                                            />
                                        }
                                        label={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body2">{provider.label}</Typography>
                                                {!provider.ready && (
                                                    <Chip
                                                        label={provider.detail || 'Unavailable'}
                                                        size="small"
                                                        color="warning"
                                                    />
                                                )}
                                            </Stack>
                                        }
                                        disabled={!provider.ready}
                                    />
                                ))}
                                {isLoadingProviders && (
                                    <Typography variant="body2" color="text.secondary">
                                        Loading providers...
                                    </Typography>
                                )}
                                {providers.length === 0 && !isLoadingProviders && (
                                    <Typography variant="body2" color="text.secondary">
                                        No providers available.
                                    </Typography>
                                )}
                            </FormGroup>
                        </Box>

                        <Divider />

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                            <TextField
                                label="Search foods"
                                placeholder="e.g. greek yogurt, oat milk, chicken breast"
                                fullWidth
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void handleSearch();
                                    }
                                }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                aria-label="Scan barcode"
                                                title="Scan barcode"
                                                onClick={() => setIsScannerOpen(true)}
                                                size="small"
                                                edge="end"
                                                disabled={isSearching || isLoadingProviders}
                                            >
                                                <QrCodeScannerIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                            <Stack direction="row" spacing={2}>
                                <Button
                                    variant="contained"
                                    onClick={() => void handleSearch()}
                                    disabled={isSearching || isLoadingProviders}
                                >
                                    {isSearching ? 'Searching...' : 'Run search'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setResults([]);
                                        setError(null);
                                    }}
                                >
                                    Clear results
                                </Button>
                            </Stack>
                        </Stack>

                        <BarcodeScannerDialog
                            open={isScannerOpen}
                            onClose={() => setIsScannerOpen(false)}
                            onDetected={(detectedBarcode) => {
                                setQuery(detectedBarcode);
                                void runSearch({ barcode: detectedBarcode });
                            }}
                        />

                        <Typography variant="caption" color="text.secondary">
                            Tip: Use the barcode scan button to test UPC/EAN lookups (camera or manual entry).
                        </Typography>

                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </CardContent>
            </Card>

            {results.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No results yet. Run a query to see provider comparisons.
                </Typography>
            ) : (
                <Grid container spacing={2}>
                    {results.map((providerResult) => (
                        <Grid key={providerResult.name} size={{ xs: 12, md: 6 }}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography variant="h6">{providerResult.label}</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {providerResult.elapsedMs !== undefined && (
                                                    <Chip label={`${providerResult.elapsedMs} ms`} size="small" />
                                                )}
                                                <Chip
                                                    label={`${providerResult.items.length} results`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            </Stack>
                                        </Box>

                                        {providerResult.error && <Alert severity="error">{providerResult.error}</Alert>}

                                        {!providerResult.error && providerResult.items.length === 0 && (
                                            <Typography variant="body2" color="text.secondary">
                                                No matches returned by this provider.
                                            </Typography>
                                        )}

                                        {providerResult.items.length > 0 && (
                                            <Stack spacing={1}>
                                                {providerResult.items.map((item) => (
                                                    <Box key={`${providerResult.name}-${item.id}`}>
                                                        <Typography variant="subtitle2">{item.description}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {buildItemDetails(item)}
                                                        </Typography>
                                                        <Divider sx={{ mt: 1 }} />
                                                    </Box>
                                                ))}
                                            </Stack>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
};

export default DevDashboard;
