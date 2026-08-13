import { useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodSearchResponse } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import {
    FoodSelectionEditor,
    type FoodSelectionSubmitRequest
} from '../src/components/FoodSelectionEditor';
import { LoadingState } from '../src/components/LoadingState';
import { useFoodDayStatus } from '../src/components/FoodTrackingStatus';
import { OverlaySelect } from '../src/components/OverlaySelect';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { useAuth } from '../src/auth/AuthContext';
import { calibrationStatusQueryKey } from '../src/calibration/queryKeys';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../src/offline/operations';
import { useOfflineOutbox } from '../src/offline/provider';
import { getTodayDate } from '../src/utils/dates';
import { triggerHapticFeedback } from '../src/utils/haptics';
import { MEAL_OPTIONS, MEAL_SELECT_OPTIONS } from '../src/utils/meals';
import { createProviderFoodSelection, type FoodLogSelection } from '../src/food/foodLogSelection';
import { radius, spacing, useAppTheme, type AppTheme } from '../src/theme';
import { getSafeActionErrorMessage } from '../src/errors/presentation';
import {
    BarcodeScanGate,
    getBarcodeLookupErrorMessage,
    getBarcodeLookupStatus,
    getCameraPermissionState,
    getProviderAttribution,
    resolveBarcodeFoodCandidates
} from '../src/barcode/workflow';

function parseMeal(value: unknown): MealPeriod {
    return typeof value === 'string' && MEAL_OPTIONS.includes(value as MealPeriod)
        ? value as MealPeriod
        : MEAL_PERIODS.BREAKFAST;
}

type BarcodeReturnTo = 'today' | 'food-log';

function parseReturnTo(value: unknown): BarcodeReturnTo {
    return value === 'food-log' ? 'food-log' : 'today';
}

export default function BarcodeScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { date, meal: mealParam, returnTo: returnToParam } = useLocalSearchParams<{
        date?: string;
        meal?: string;
        returnTo?: string;
    }>();
    const { api, user, isLoading: isAuthLoading } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const [permission, requestPermission, refreshPermission] = useCameraPermissions();
    const [barcode, setBarcode] = useState<string | null>(null);
    const [cameraMessage, setCameraMessage] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [meal, setMeal] = useState<MealPeriod>(() => parseMeal(mealParam));
    const [selection, setSelection] = useState<FoodLogSelection | null>(null);
    const [lookupResult, setLookupResult] = useState<FoodSearchResponse | null>(null);
    const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
    const scanGate = useRef(new BarcodeScanGate());
    const activeBarcodeRef = useRef<string | null>(null);
    const selectedDate = typeof date === 'string' ? date : getTodayDate(user?.timezone);
    const returnTo = parseReturnTo(returnToParam);
    const foodDayQuery = useFoodDayStatus(selectedDate, Boolean(user));
    const lookup = useMutation({
        mutationFn: (code: string) => api.searchFood('', code),
        onSuccess: (response, scannedBarcode) => {
            if (activeBarcodeRef.current !== scannedBarcode) return;
            setLookupResult(response);
            const candidates = resolveBarcodeFoodCandidates(response.items, scannedBarcode);
            setSelection(candidates.length === 1 ? createProviderFoodSelection(candidates[0]) : null);
        }
    });
    const logFood = useMutation({
        mutationFn: ({ payload }: FoodSelectionSubmitRequest) => {
            if (foodDayQuery.data?.status !== 'OPEN') {
                throw new Error('Backfill this day before adding food.');
            }
            if (!barcode) {
                throw new Error('Scan a barcode before logging food.');
            }
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG,
                payload,
                execute: (operationId) => api.createFoodLog(payload, operationId),
                enqueue
            });
        },
        onSuccess: async (_result, request) => {
            triggerHapticFeedback(user?.haptics_enabled, 'success');
            await queryClient.invalidateQueries({ queryKey: ['mobile-food', selectedDate] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-food-day', selectedDate] });
            await queryClient.invalidateQueries({ queryKey: calibrationStatusQueryKey });
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] });
            if (!request.closeAfterLogging) {
                resetScanner();
                return;
            }
            if (returnTo === 'food-log') {
                router.replace({ pathname: '/(tabs)/food-log', params: { date: selectedDate } });
                return;
            }
            router.replace('/(tabs)/today');
        }
    });

    const cameraPermissionState = getCameraPermissionState(permission);

    if (isAuthLoading) {
        return <LoadingState label="Restoring session..." />;
    }

    if (!user) {
        return <Redirect href="/(auth)/login" />;
    }

    if (foodDayQuery.isLoading) {
        return <LoadingState label="Checking tracking status..." />;
    }

    if (foodDayQuery.data?.status !== 'OPEN') {
        return (
            <Screen safeTop>
                <AppCard>
                    <SectionHeader
                        headingLevel={1}
                        title="Food logging is unavailable"
                        description="Resume tracking or backfill this day from Today before scanning a barcode."
                    />
                    <AppButton title="Back to Today" onPress={() => router.replace('/(tabs)/today')} />
                </AppCard>
            </Screen>
        );
    }

    if (cameraPermissionState === 'checking') {
        return <LoadingState label="Checking camera permission..." />;
    }

    if (cameraPermissionState === 'request' || cameraPermissionState === 'settings') {
        const mustUseSettings = cameraPermissionState === 'settings';
        const isWeb = Platform.OS === 'web';
        const blockedPermissionMessage = isWeb
            ? 'Camera access is blocked. Enable it in your browser site settings.'
            : 'Camera access is blocked. Open Android settings to enable it.';
        const stillBlockedMessage = isWeb
            ? 'Camera access is still disabled in your browser site settings.'
            : 'Camera access is still disabled in Android settings.';
        const blockedPermissionDescription = isWeb
            ? 'Camera access is blocked for this site. Enable it from your browser site settings.'
            : 'Camera access is blocked for Calibrate. Enable it from the Android app permissions screen.';
        const permissionDescription = mustUseSettings
            ? blockedPermissionDescription
            : "Barcode scanning uses this device's camera to find matching packaged foods.";
        let permissionActionHint = 'Shows the camera permission prompt.';
        if (mustUseSettings) {
            permissionActionHint = isWeb
                ? 'Checks whether camera permission is enabled for this site.'
                : 'Opens the Calibrate app permissions in Android settings.';
        }
        let permissionActionTitle = 'Try camera permission again';
        if (mustUseSettings) permissionActionTitle = isWeb ? 'Check camera access' : 'Open Android settings';

        async function retryCameraPermission() {
            setCameraMessage(null);
            try {
                const nextPermission = await requestPermission();
                if (!nextPermission.granted) {
                    setCameraMessage(
                        nextPermission.canAskAgain
                            ? 'Camera permission was not granted. You can try again.'
                            : blockedPermissionMessage
                    );
                }
            } catch {
                setCameraMessage('Unable to request camera permission. Try again.');
            }
        }

        async function openCameraSettings() {
            setCameraMessage(null);
            try {
                await Linking.openSettings();
                setCameraMessage('After enabling Camera in Android settings, return here and check access again.');
            } catch {
                setCameraMessage('Unable to open Android settings. Open the Calibrate app permissions manually.');
            }
        }

        async function checkCameraPermission() {
            setCameraMessage(null);
            try {
                const nextPermission = await refreshPermission();
                if (!nextPermission.granted) {
                    setCameraMessage(stillBlockedMessage);
                }
            } catch {
                setCameraMessage('Unable to check camera permission. Try again.');
            }
        }

        async function handlePermissionAction() {
            if (!mustUseSettings) {
                await retryCameraPermission();
                return;
            }
            if (isWeb) {
                await checkCameraPermission();
                return;
            }
            await openCameraSettings();
        }

        return (
            <Screen safeTop>
                <AppCard>
                    <SectionHeader
                        headingLevel={1}
                        title="Camera permission"
                        description={permissionDescription}
                    />
                    {cameraMessage && (
                        <AppText accessibilityLiveRegion="polite" style={styles.permissionMessage}>
                            {cameraMessage}
                        </AppText>
                    )}
                    <AppButton
                        accessibilityRole="button"
                        accessibilityHint={permissionActionHint}
                        title={permissionActionTitle}
                        leftIcon={<Ionicons name="camera-outline" size={18} color={theme.colors.onPrimary} />}
                        onPress={() => void handlePermissionAction()}
                    />
                    {mustUseSettings && !isWeb && (
                        <AppButton
                            accessibilityRole="button"
                            accessibilityHint="Checks whether camera permission is now enabled."
                            title="Check camera access"
                            variant="secondary"
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={theme.colors.onSurface} />}
                            onPress={() => void checkCameraPermission()}
                        />
                    )}
                    <AppButton
                        accessibilityRole="button"
                        title="Back to log"
                        variant="ghost"
                        leftIcon={<Ionicons name="arrow-back" size={18} color={theme.colors.onSurface} />}
                        onPress={() => router.back()}
                    />
                </AppCard>
            </Screen>
        );
    }

    function handleBarcodeScanned(result: BarcodeScanningResult) {
        const decision = scanGate.current.accept(result.data);
        if (decision.kind === 'duplicate') return;
        if (decision.kind === 'invalid') {
            setScanError(decision.message);
            return;
        }

        setScanError(null);
        setSelection(null);
        setLookupResult(null);
        activeBarcodeRef.current = decision.barcode;
        setBarcode(decision.barcode);
        lookup.mutate(decision.barcode);
    }

    const candidates = barcode
        ? resolveBarcodeFoodCandidates(lookupResult?.items, barcode)
        : [];
    const lookupStatus = getBarcodeLookupStatus({
        hasBarcode: barcode !== null,
        isPending: lookup.isPending,
        isSuccess: lookup.isSuccess,
        hasResult: candidates.length > 0,
        hasError: Boolean(lookup.error)
    });
    const providerAttribution = getProviderAttribution(lookupResult?.provider, lookupResult?.attribution);
    const lookupErrorMessage = lookup.error ? getBarcodeLookupErrorMessage(lookup.error) : null;

    function resetScanner() {
        scanGate.current.reset();
        activeBarcodeRef.current = null;
        setBarcode(null);
        setScanError(null);
        setSelection(null);
        setLookupResult(null);
        setIsMealSelectorOpen(false);
        lookup.reset();
        logFood.reset();
    }

    function retryLookup() {
        if (!barcode) return;
        setSelection(null);
        setLookupResult(null);
        activeBarcodeRef.current = barcode;
        lookup.reset();
        lookup.mutate(barcode);
    }

    let statusMessage = 'Camera ready. Center an EAN or UPC barcode in the frame.';
    if (scanError) statusMessage = scanError;
    else if (lookupStatus === 'searching') statusMessage = 'Searching food providers...';
    else if (lookupStatus === 'no-result') statusMessage = 'No matching food was found. Try again or scan a different barcode.';
    else if (lookupStatus === 'error' && lookupErrorMessage) statusMessage = lookupErrorMessage;
    else if (lookupStatus === 'result' && candidates.length === 1) statusMessage = `Found ${candidates[0].name}.`;
    else if (lookupStatus === 'result') statusMessage = `Found ${candidates.length} possible matches. Choose the right food.`;

    if (!barcode) {
        return (
            <Screen scroll={false} safeTop style={styles.scannerRoot}>
                <CameraView
                    style={styles.camera}
                    facing="back"
                    accessible
                    accessibilityLabel="Barcode camera preview"
                    barcodeScannerSettings={{
                        barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e']
                    }}
                    onBarcodeScanned={handleBarcodeScanned}
                >
                    <View style={styles.scanOverlay}>
                        <View accessible={false} style={styles.scanFrame} />
                    </View>
                </CameraView>
                <View style={styles.panel}>
                    <AppCard>
                        <SectionHeader
                            headingLevel={1}
                            title="Scan barcode"
                            description="Center the packaged-food barcode in the frame."
                        />
                        <AppText
                            accessibilityLiveRegion="polite"
                            accessibilityRole={scanError ? 'alert' : undefined}
                            style={scanError ? styles.error : undefined}
                            variant={scanError ? 'body' : 'muted'}
                        >
                            {statusMessage}
                        </AppText>
                        <AppButton
                            accessibilityRole="button"
                            title="Back to log"
                            variant="secondary"
                            leftIcon={<Ionicons name="arrow-back" size={18} color={theme.colors.onSurface} />}
                            onPress={() => router.back()}
                        />
                    </AppCard>
                </View>
            </Screen>
        );
    }

    return (
        <Screen safeTop>
            <AppCard>
                <SectionHeader
                    headingLevel={1}
                    title={`Barcode ${barcode}`}
                    description="Choose the food, then confirm its amount before logging."
                />
                <AppText
                    accessibilityLiveRegion="polite"
                    accessibilityRole={lookupStatus === 'error' ? 'alert' : undefined}
                    style={lookupStatus === 'error' ? styles.error : undefined}
                    variant={lookupStatus === 'error' ? 'body' : 'muted'}
                >
                    {statusMessage}
                </AppText>
                {providerAttribution && (
                    <AppText
                        accessibilityRole={providerAttribution.url ? 'link' : undefined}
                        accessibilityHint={providerAttribution.url ? 'Opens the food provider website.' : undefined}
                        onPress={providerAttribution.url
                            ? () => void Linking.openURL(providerAttribution.url!)
                            : undefined}
                        style={providerAttribution.url ? styles.attributionLink : undefined}
                        variant="caption"
                    >
                        {providerAttribution.text}
                    </AppText>
                )}
                <View style={styles.mealField}>
                    <AppText variant="label">Meal</AppText>
                    <OverlaySelect
                        accessibilityLabel="Select meal"
                        value={meal}
                        options={MEAL_SELECT_OPTIONS}
                        isOpen={isMealSelectorOpen}
                        onToggle={() => setIsMealSelectorOpen((current) => !current)}
                        onChange={(nextMeal) => {
                            setMeal(nextMeal);
                            setIsMealSelectorOpen(false);
                        }}
                    />
                </View>
                {selection ? (
                    <FoodSelectionEditor
                        selection={selection}
                        date={selectedDate}
                        meal={meal}
                        isSubmitting={logFood.isPending}
                        error={logFood.error
                            ? getSafeActionErrorMessage(logFood.error, 'Food could not be added. Try again.')
                            : null}
                        onCancel={() => {
                            logFood.reset();
                            setSelection(null);
                        }}
                        onSubmit={(request) => logFood.mutate(request)}
                    />
                ) : (
                    <View style={styles.results}>
                        {candidates.map((candidate) => (
                            <Pressable
                                key={`${candidate.source ?? 'food'}:${candidate.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={`Choose ${candidate.name}`}
                                disabled={logFood.isPending}
                                onPress={() => {
                                    logFood.reset();
                                    setSelection(createProviderFoodSelection(candidate));
                                }}
                                style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                            >
                                <View style={styles.resultText}>
                                    <AppText variant="body" numberOfLines={2}>{candidate.name}</AppText>
                                    <AppText variant="caption" numberOfLines={2}>
                                        {candidate.brand ?? `${candidate.measures.length} serving option${candidate.measures.length === 1 ? '' : 's'}`}
                                    </AppText>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceVariant} />
                            </Pressable>
                        ))}
                    </View>
                )}
                {(lookupStatus === 'no-result' || lookupStatus === 'error') && (
                    <AppButton
                        accessibilityRole="button"
                        accessibilityHint="Repeats the provider lookup for the scanned barcode."
                        title="Try lookup again"
                        variant="secondary"
                        leftIcon={<Ionicons name="cloud-download-outline" size={18} color={theme.colors.onSurface} />}
                        onPress={retryLookup}
                    />
                )}
                <View style={styles.actions}>
                    <AppButton
                        accessibilityRole="button"
                        accessibilityHint="Clears this result and re-enables the camera scanner."
                        title="Scan again"
                        variant="secondary"
                        disabled={lookup.isPending || logFood.isPending}
                        leftIcon={<Ionicons name="refresh-outline" size={18} color={theme.colors.onSurface} />}
                        onPress={resetScanner}
                        style={styles.actionButton}
                    />
                    <AppButton
                        accessibilityRole="button"
                        title="Back to log"
                        leftIcon={<Ionicons name="arrow-back" size={18} color={theme.colors.onPrimary} />}
                        onPress={() => router.back()}
                        style={styles.actionButton}
                    />
                </View>
            </AppCard>
        </Screen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    scannerRoot: {
        paddingHorizontal: 0,
        paddingBottom: 0
    },
    camera: {
        flex: 1
    },
    scanOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.12)'
    },
    scanFrame: {
        width: 260,
        height: 160,
        borderRadius: radius.md,
        borderWidth: 3,
        borderColor: theme.colors.onSurface,
        backgroundColor: 'transparent'
    },
    panel: {
        padding: spacing.lg,
        backgroundColor: theme.colors.background
    },
    mealField: {
        gap: spacing.sm
    },
    results: {
        gap: spacing.sm
    },
    resultRow: {
        minHeight: theme.interaction.minimumTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        borderWidth: theme.stroke.control,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.md
    },
    resultText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    },
    error: {
        color: theme.colors.danger
    },
    permissionMessage: {
        color: theme.colors.onSurfaceVariant
    },
    attributionLink: {
        color: theme.colors.primary,
        textDecorationLine: 'underline'
    },
    pressed: {
        opacity: 0.82
    }
});
