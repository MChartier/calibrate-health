import { Redirect, Stack, useLocalSearchParams, useSegments } from 'expo-router';
import { LoadingState } from '../../src/components/LoadingState';
import { useAuth } from '../../src/auth/AuthContext';
import {
    resolveBarcodeAuthDestination,
    type BarcodeAuthReturnParams
} from '../../src/barcode/authReturn';

export default function AuthLayout() {
    const { user, isLoading, accountDeletionCleanupNotice } = useAuth();
    const segments = useSegments();
    const params = useLocalSearchParams<BarcodeAuthReturnParams>();

    if (isLoading) {
        return <LoadingState />;
    }

    if (user) {
        return <Redirect href={resolveBarcodeAuthDestination(params) ?? '/today'} />;
    }

    if (accountDeletionCleanupNotice && segments[0] !== 'login') {
        return <Redirect href="/(auth)/login" />;
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}
