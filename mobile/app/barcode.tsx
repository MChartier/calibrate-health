import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { LoadingState } from '../src/components/LoadingState';
import { Screen } from '../src/components/Screen';
import { useAuth } from '../src/auth/AuthContext';
import { colors, spacing } from '../src/theme';

export default function BarcodeScreen() {
    const { api } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [barcode, setBarcode] = useState<string | null>(null);
    const lookup = useMutation({
        mutationFn: (code: string) => api.searchFood('', code)
    });

    if (!permission) {
        return <LoadingState label="Checking camera permission..." />;
    }

    if (!permission.granted) {
        return (
            <Screen>
                <AppCard>
                    <AppText variant="subtitle">Camera permission</AppText>
                    <AppText variant="muted">Barcode scanning uses the Android camera to find matching packaged foods.</AppText>
                    <AppButton title="Allow camera" onPress={() => void requestPermission()} />
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
            />
            <View style={styles.panel}>
                <AppCard>
                    <AppText variant="subtitle">{barcode ? `Barcode ${barcode}` : 'Scan a barcode'}</AppText>
                    {lookup.isPending && <AppText variant="muted">Searching food providers...</AppText>}
                    {first && (
                        <>
                            <AppText>{first.name}</AppText>
                            <AppText variant="muted">{first.brand ?? 'Food provider result'}</AppText>
                        </>
                    )}
                    {lookup.isSuccess && !first && <AppText variant="muted">No matching food found.</AppText>}
                    {lookup.error && <AppText style={styles.error}>{lookup.error.message}</AppText>}
                    <View style={styles.actions}>
                        <AppButton title="Scan again" variant="secondary" onPress={() => { setBarcode(null); lookup.reset(); }} />
                        <AppButton title="Back to log" onPress={() => router.back()} />
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
    panel: {
        padding: spacing.lg,
        backgroundColor: colors.background
    },
    actions: {
        gap: spacing.md
    },
    error: {
        color: colors.danger
    }
});
