import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { NumberStepperField } from './NumberStepperField';
import { SectionHeader } from './SectionHeader';
import { useAuth } from '../auth/AuthContext';
import { formatDateOnlyForDisplay } from '../utils/dates';
import { formatWeightUnit } from '../utils/format';
import { colors, spacing } from '../theme';

type WeightEntrySheetProps = {
    visible: boolean;
    date: string;
    onClose: () => void;
    onSaved?: () => void;
};

/**
 * Focused weigh-in bottom sheet used by Goals and deep-linked weight routes.
 */
export const WeightEntrySheet: React.FC<WeightEntrySheetProps> = ({ visible, date, onClose, onSaved }) => {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const [weight, setWeight] = useState('');
    const weightUnit = formatWeightUnit(user?.weight_unit);

    const addWeight = useMutation({
        mutationFn: () => api.addMetric({ weight: Number(weight), date }),
        onSuccess: async () => {
            setWeight('');
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
            ]);
            onSaved?.();
            onClose();
        }
    });

    const canSave = Number.isFinite(Number(weight)) && Number(weight) > 0;

    return (
        <BottomSheetModal visible={visible} onRequestClose={onClose}>
            <SectionHeader title="Log weight" description={`${formatDateOnlyForDisplay(date)} | ${weightUnit}`} />
            <NumberStepperField
                label="Weight"
                value={weight}
                onChangeText={setWeight}
                step={0.5}
                min={0}
                suffix={weightUnit}
            />
            {addWeight.error && <AppText style={styles.error}>{addWeight.error.message}</AppText>}
            <View style={styles.row}>
                <AppButton
                    title="Cancel"
                    variant="secondary"
                    leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                    onPress={onClose}
                    style={styles.rowButton}
                />
                <AppButton
                    title={addWeight.isPending ? 'Saving...' : 'Save'}
                    disabled={!canSave || addWeight.isPending}
                    leftIcon={<Ionicons name="scale-outline" size={18} color="#ffffff" />}
                    onPress={() => addWeight.mutate()}
                    style={styles.rowButton}
                />
            </View>
        </BottomSheetModal>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
