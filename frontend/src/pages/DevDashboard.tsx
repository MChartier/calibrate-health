import React, { useCallback, useEffect, useState } from 'react';
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

const SERVICE_WORKER_READY_TIMEOUT_MS = 5000; // Avoid hanging in dev when no service worker is registered.

/**
 * Convert a base64 URL-safe VAPID key into a Uint8Array for PushManager.subscribe().
 */
const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

/**
 * Prefer the registration that can immediately handle push events.
 */
const pickBestServiceWorkerRegistration = (
    registrations: ServiceWorkerRegistration[]
): ServiceWorkerRegistration | null => {
    if (registrations.length === 0) {
        return null;
    }

    return (
        registrations.find((registration) => Boolean(registration.active)) ??
        registrations.find((registration) => Boolean(registration.waiting)) ??
        registrations.find((registration) => Boolean(registration.installing)) ??
        registrations[0]
    );
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

    const notificationPermission =
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    const supportsServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in navigator;
    const supportsPushManager = typeof window !== 'undefined' && 'PushManager' in window;

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
            return;
        }

        try {
            const currentPageRegistration = await navigator.serviceWorker.getRegistration();
            const registration =
                currentPageRegistration ??
                pickBestServiceWorkerRegistration(await navigator.serviceWorker.getRegistrations());
            if (!registration) {
                setHasPushSubscription(false);
                return;
            }
            const subscription = await registration.pushManager.getSubscription();
            setHasPushSubscription(Boolean(subscription));
        } catch (err) {
            console.error(err);
            setHasPushSubscription(false);
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
     * Resolve the active service worker registration without hanging if none is registered.
     */
    const resolveServiceWorkerRegistration = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
        if (!('serviceWorker' in navigator)) {
            return null;
        }

        try {
            const timeoutPromise = new Promise<null>((resolve) => {
                window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS);
            });

            const readyPromise = navigator.serviceWorker.ready as Promise<ServiceWorkerRegistration>;
            const registration = await Promise.race<ServiceWorkerRegistration | null>([readyPromise, timeoutPromise]);
            if (registration) {
                return registration;
            }

            const currentPageRegistration = await navigator.serviceWorker.getRegistration();
            if (currentPageRegistration) {
                return currentPageRegistration;
            }

            return pickBestServiceWorkerRegistration(await navigator.serviceWorker.getRegistrations());
        } catch (err) {
            console.error(err);
            return null;
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

            await axios.post('/api/notifications/subscription', subscription.toJSON());
            setHasPushSubscription(true);
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
    }, [loadPushSubscriptionStatus, resolveServiceWorkerRegistration]);

    /**
     * Send a basic test notification to validate delivery and click handling.
     */
    const handleSendTestNotification = useCallback(async () => {
        setPushError(null);
        setPushStatus(null);
        setIsSendingPush(true);
        try {
            await axios.post('/api/dev/notifications/test');
            setPushStatus('Test notification sent.');
        } catch (err) {
            console.error(err);
            const serverMessage = axios.isAxiosError(err)
                ? (err.response?.data as { message?: unknown } | undefined)?.message
                : null;
            setPushError(
                typeof serverMessage === 'string' && serverMessage.trim().length > 0
                    ? serverMessage
                    : 'Failed to send test notification.'
            );
        } finally {
            setIsSendingPush(false);
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
                                Push notifications
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Register a push subscription and send a test notification to validate service worker
                                delivery.
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

                        {pushError && <Alert severity="error">{pushError}</Alert>}
                        {pushStatus && <Alert severity="success">{pushStatus}</Alert>}

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Button
                                variant="contained"
                                onClick={() => void handleRegisterPush()}
                                disabled={isPreparingPush}
                            >
                                {isPreparingPush ? 'Registering...' : 'Register push subscription'}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={() => void handleSendTestNotification()}
                                disabled={!hasPushSubscription || isSendingPush}
                            >
                                {isSendingPush ? 'Sending...' : 'Send test notification'}
                            </Button>
                            <Button
                                variant="text"
                                onClick={() => {
                                    setPushError(null);
                                    setPushStatus(null);
                                }}
                                disabled={isPreparingPush || isSendingPush}
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
