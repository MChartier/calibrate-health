import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';
import type { FoodLogCreatePayload, FoodSearchResult } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { LoadingState } from '../src/components/LoadingState';
import { OverlaySelect, type OverlaySelectOption } from '../src/components/OverlaySelect';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { useAuth } from '../src/auth/AuthContext';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../src/offline/operations';
import { useOfflineOutbox } from '../src/offline/provider';
import { getTodayDate } from '../src/utils/dates';
import { formatCalories, formatMealPeriod } from '../src/utils/format';
import { MEAL_OPTIONS } from '../src/utils/meals';
import { colors, radius, spacing } from '../src/theme';
import {
    BarcodeScanGate,
    getBarcodeLookupErrorMessage,
    getBarcodeLookupStatus,
    getCameraPermissionState,
    getProviderAttribution
} from '../src/barcode/workflow';

const MEAL_SELECTOR_OPTIONS: Array<OverlaySelectOption<MealPeriod>> = MEAL_OPTIONS.map((option) => ({
    value: option,
    label: formatMealPeriod(option)
}));

function parseMeal(value: unknown): MealPeriod {
    return typeof value === 'string' && MEAL_OPTIONS.includes(value as MealPeriod)
        ? value as MealPeriod
        : MEAL_PERIODS.BREAKFAST;
}

function buildBarcodeFoodPayload(result: FoodSearchResult, code: string, date: string, meal: MealPeriod): FoodLogCreatePayload {
    const calories = typeof result.calories === 'number' ? Math.round(result.calories) : 0;

    return {
        date,
        meal_period: meal,
        name: result.name,
        calories,
        servings_consumed: 1,
        calories_per_serving_snapshot: calories,
        external_source: result.source ?? null,
        external_id: result.id,
        brand: result.brand ?? null,
        barcode: result.barcode ?? code
    };
}

export default function BarcodeScreen() {
    const { date, meal: mealParam } = useLocalSearchParams<{ date?: string; meal?: string }>();
    const { api, user } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const [permission, requestPermission, refreshPermission] = useCameraPermissions();
    const [barcode, setBarcode] = useState<string | null>(null);
    const [cameraMessage, setCameraMessage] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [meal, setMeal] = useState<MealPeriod>(() => parseMeal(mealParam));
    const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
    const scanGate = useRef(new BarcodeScanGate());
    const selectedDate = typeof date === 'string' ? date : getTodayDate(user?.timezone);
    const lookup = useMutation({
        mutationFn: (code: string) => api.searchFood('', code)
    });
    const logFood = useMutation({
        mutationFn: (result: FoodSearchResult) => {
            if (!barcode) {
                throw new Error('Scan a barcode before logging food.');
            }
            const payload = buildBarcodeFoodPayload(result, barcode, selectedDate, meal);
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.CREATE_FOOD_LOG,
                payload,
                execute: (operationId) => api.createFoodLog(payload, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await queryClient.invalidateQueries({ queryKey: ['mobile-food', selectedDate] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-food-day', selectedDate] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-in-app-notifications'] });
            router.replace('/(tabs)/today');
        }
    });

    const cameraPermissionState = getCameraPermissionState(permission);

    if (cameraPermissionState === 'checking') {
        return <LoadingState label="Checking camera permission..." />;
    }

    if (cameraPermissionState === 'request' || cameraPermissionState === 'settings') {
        const mustUseSettings = cameraPermissionState === 'settings';

        async function retryCameraPermission() {
            setCameraMessage(null);
            try {
                const nextPermission = await requestPermission();
                if (!nextPermission.granted) {
                    setCameraMessage(
                        nextPermission.canAskAgain
                            ? 'Camera permission was not granted. You can try again.'
                            : 'Camera access is blocked. Open Android settings to enable it.'
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
                    setCameraMessage('Camera access is still disabled in Android settings.');
                }
            } catch {
                setCameraMessage('Unable to check camera permission. Try again.');
            }
        }

        return (
            <Screen>
                <AppCard>
                    <SectionHeader
                        title="Camera permission"
                        description={mustUseSettings
                            ? 'Camera access is blocked for Calibrate. Enable it from the Android app permissions screen.'
                            : 'Barcode scanning uses the Android camera to find matching packaged foods.'}
                    />
                    {cameraMessage && (
                        <AppText accessibilityLiveRegion="polite" style={styles.permissionMessage}>
                            {cameraMessage}
                        </AppText>
                    )}
                    <AppButton
                        accessibilityRole="button"
                        accessibilityHint={mustUseSettings
                            ? 'Opens the Calibrate app permissions in Android settings.'
                            : 'Shows the Android camera permission prompt.'}
                        title={mustUseSettings ? 'Open Android settings' : 'Try camera permission again'}
                        leftIcon={<Ionicons name="camera-outline" size={18} color="#ffffff" />}
                        onPress={() => void (mustUseSettings ? openCameraSettings() : retryCameraPermission())}
                    />
                    {mustUseSettings && (
                        <AppButton
                            accessibilityRole="button"
                            accessibilityHint="Checks whether camera permission is now enabled."
                            title="Check camera access"
                            variant="secondary"
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={colors.text} />}
                            onPress={() => void checkCameraPermission()}
                        />
                    )}
                    <AppButton
                        accessibilityRole="button"
                        title="Back to log"
                        variant="ghost"
                        leftIcon={<Ionicons name="arrow-back" size={18} color={colors.text} />}
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
        setBarcode(decision.barcode);
        lookup.mutate(decision.barcode);
    }

    const first = lookup.data?.items[0];
    const lookupStatus = getBarcodeLookupStatus({
        hasBarcode: barcode !== null,
        isPending: lookup.isPending,
        isSuccess: lookup.isSuccess,
        hasResult: Boolean(first),
        hasError: Boolean(lookup.error)
    });
    const providerAttribution = getProviderAttribution(lookup.data?.provider, lookup.data?.attribution);
    const lookupErrorMessage = lookup.error ? getBarcodeLookupErrorMessage(lookup.error) : null;

    function resetScanner() {
        scanGate.current.reset();
        setBarcode(null);
        setScanError(null);
        setIsMealSelectorOpen(false);
        lookup.reset();
        logFood.reset();
    }

    function retryLookup() {
        if (!barcode) return;
        lookup.reset();
        lookup.mutate(barcode);
    }

    let statusMessage = 'Camera ready. Center an EAN or UPC barcode in the frame.';
    if (scanError) statusMessage = scanError;
    else if (lookupStatus === 'searching') statusMessage = 'Searching food providers...';
    else if (lookupStatus === 'no-result') statusMessage = 'No matching food was found. Try again or scan a different barcode.';
    else if (lookupStatus === 'error' && lookupErrorMessage) statusMessage = lookupErrorMessage;
    else if (lookupStatus === 'result' && first) statusMessage = `Found ${first.name}.`;

    return (
        <Screen scroll={false} style={styles.root}>
            <CameraView
                style={styles.camera}
                facing="back"
                accessible
                accessibilityLabel="Barcode camera preview"
                barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e']
                }}
                onBarcodeScanned={barcode ? undefined : handleBarcodeScanned}
            >
                <View style={styles.scanOverlay}>
                    <View accessible={false} style={styles.scanFrame} />
                </View>
            </CameraView>
            <View style={styles.panel}>
                <AppCard>
                    <SectionHeader
                        title={barcode ? `Barcode ${barcode}` : 'Scan barcode'}
                        description="Center the packaged-food barcode in the frame."
                    />
                    <AppText
                        accessibilityLiveRegion="polite"
                        accessibilityRole={lookupStatus === 'error' || Boolean(scanError) ? 'alert' : undefined}
                        style={lookupStatus === 'error' || scanError ? styles.error : undefined}
                        variant={lookupStatus === 'error' || scanError ? 'body' : 'muted'}
                    >
                        {statusMessage}
                    </AppText>
                    {first && (
                        <View
                            accessible
                            accessibilityLabel={`${first.name}, ${first.brand ?? 'provider result'}, ${formatCalories(first.calories)}`}
                            style={styles.result}
                        >
                            <AppText variant="body">{first.name}</AppText>
                            <AppText variant="caption">{first.brand ?? 'Food provider result'}</AppText>
                            <AppText variant="label">{formatCalories(first.calories)}</AppText>
                        </View>
                    )}
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
                    <AppText variant="label">Meal</AppText>
                    <OverlaySelect
                        accessibilityLabel="Select meal"
                        value={meal}
                        options={MEAL_SELECTOR_OPTIONS}
                        isOpen={isMealSelectorOpen}
                        onToggle={() => setIsMealSelectorOpen((current) => !current)}
                        onChange={(nextMeal) => {
                            setMeal(nextMeal);
                            setIsMealSelectorOpen(false);
                        }}
                    />
                    {logFood.error && (
                        <AppText accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
                            {logFood.error.message}
                        </AppText>
                    )}
                    <AppButton
                        accessibilityRole="button"
                        accessibilityHint="Adds the matched food to the selected day and meal."
                        title={logFood.isPending ? 'Logging...' : `Log to ${selectedDate}`}
                        disabled={!first || lookupStatus !== 'result' || logFood.isPending}
                        leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                        onPress={() => {
                            if (first) logFood.mutate(first);
                        }}
                    />
                    {(lookupStatus === 'no-result' || lookupStatus === 'error') && barcode && (
                        <AppButton
                            accessibilityRole="button"
                            accessibilityHint="Repeats the provider lookup for the scanned barcode."
                            title="Try lookup again"
                            variant="secondary"
                            leftIcon={<Ionicons name="cloud-download-outline" size={18} color={colors.text} />}
                            onPress={retryLookup}
                        />
                    )}
                    <View style={styles.actions}>
                        <AppButton
                            accessibilityRole="button"
                            accessibilityHint="Clears this result and re-enables the camera scanner."
                            title="Scan again"
                            variant="secondary"
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={colors.text} />}
                            onPress={resetScanner}
                            style={styles.actionButton}
                        />
                        <AppButton
                            accessibilityRole="button"
                            title="Back to log"
                            leftIcon={<Ionicons name="arrow-back" size={18} color="#ffffff" />}
                            onPress={() => router.back()}
                            style={styles.actionButton}
                        />
                    </View>
                </AppCard>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    root: {
        padding: 0
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
        borderColor: colors.surface,
        backgroundColor: 'transparent'
    },
    panel: {
        padding: spacing.lg,
        backgroundColor: colors.background
    },
    result: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md,
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
        color: colors.danger
    },
    permissionMessage: {
        color: colors.muted
    },
    attributionLink: {
        color: colors.primary,
        textDecorationLine: 'underline'
    }
});
