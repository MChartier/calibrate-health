/**
 * Provides Expo client behavior for barcode recovery actions.
 */
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme';

type BarcodeRecoveryActionsProps = {
    disabled?: boolean;
    onSearchFoods: () => void;
    onAddManually: () => void;
};

/** Shared escape hatches for every camera, connectivity, and lookup failure. */
export function BarcodeRecoveryActions({
    disabled = false,
    onSearchFoods,
    onAddManually
}: BarcodeRecoveryActionsProps) {
    const theme = useAppTheme();

    return (
        <View>
            <AppButton
                title="Search foods"
                variant="secondary"
                disabled={disabled}
                leftIcon={<Ionicons name="search-outline" size={18} color={theme.colors.onSurface} />}
                onPress={onSearchFoods}
            />
            <AppButton
                title="Add manually"
                variant="ghost"
                disabled={disabled}
                leftIcon={<Ionicons name="create-outline" size={18} color={theme.colors.onSurface} />}
                onPress={onAddManually}
            />
        </View>
    );
}
