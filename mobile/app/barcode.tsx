import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { getTodayDate } from '../src/utils/dates';
import { formatCalories, formatMealPeriod } from '../src/utils/format';
import { MEAL_OPTIONS } from '../src/utils/meals';
import { colors, radius, spacing } from '../src/theme';

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
    const queryClient = useQueryClient();
    const [permission, requestPermission] = useCameraPermissions();
    const [barcode, setBarcode] = useState<string | null>(null);
    const [meal, setMeal] = useState<MealPeriod>(() => parseMeal(mealParam));
    const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
    const selectedDate = typeof date === 'string' ? date : getTodayDate(user?.timezone);
    const lookup = useMutation({
        mutationFn: (code: string) => api.searchFood('', code)
    });
    const logFood = useMutation({
        mutationFn: (result: FoodSearchResult) => {
            if (!barcode) {
                throw new Error('Scan a barcode before logging food.');
            }
            return api.createFoodLog(buildBarcodeFoodPayload(result, barcode, selectedDate, meal));
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

    if (!permission) {
        return <LoadingState label="Checking camera permission..." />;
    }

    if (!permission.granted) {
        return (
            <Screen>
                <AppCard>
                    <SectionHeader title="Camera permission" description="Barcode scanning uses the Android camera to find matching packaged foods." />
                    <AppButton
                        title="Allow camera"
                        leftIcon={<Ionicons name="camera-outline" size={18} color="#ffffff" />}
                        onPress={() => void requestPermission()}
                    />
                </AppCard>
            </Screen>
        );
    }

    function handleBarcodeScanned(result: BarcodeScanningResult) {
        if (barcode) return;
        setBarcode(result.data);
        lookup.mutate(result.data);
    }

    const first = lookup.data?.items[0];

    return (
        <Screen scroll={false} style={styles.root}>
            <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e']
                }}
                onBarcodeScanned={handleBarcodeScanned}
            >
                <View style={styles.scanOverlay}>
                    <View style={styles.scanFrame} />
                </View>
            </CameraView>
            <View style={styles.panel}>
                <AppCard>
                    <SectionHeader
                        title={barcode ? `Barcode ${barcode}` : 'Scan barcode'}
                        description="Center the packaged-food barcode in the frame."
                    />
                    {lookup.isPending && <AppText variant="muted">Searching food providers...</AppText>}
                    {first && (
                        <View style={styles.result}>
                            <AppText variant="body">{first.name}</AppText>
                            <AppText variant="caption">{first.brand ?? 'Food provider result'}</AppText>
                            <AppText variant="label">{formatCalories(first.calories)}</AppText>
                        </View>
                    )}
                    {lookup.isSuccess && !first && <AppText variant="muted">No matching food found.</AppText>}
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
                    {(lookup.error || logFood.error) && <AppText style={styles.error}>{lookup.error?.message ?? logFood.error?.message}</AppText>}
                    <AppButton
                        title={logFood.isPending ? 'Logging...' : `Log to ${selectedDate}`}
                        disabled={!first || logFood.isPending}
                        leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                        onPress={() => {
                            if (first) logFood.mutate(first);
                        }}
                    />
                    <View style={styles.actions}>
                        <AppButton
                            title="Scan again"
                            variant="secondary"
                            leftIcon={<Ionicons name="refresh-outline" size={18} color={colors.text} />}
                            onPress={() => {
                                setBarcode(null);
                                lookup.reset();
                            }}
                            style={styles.actionButton}
                        />
                        <AppButton
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
    }
});
