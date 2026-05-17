import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { MetricEntry } from '@calibrate/api-client';
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

const WEIGHT_ENTRY_STEP = 0.1; // Matches the PWA and backend rounding so daily weigh-ins are not coarse.
const WEIGHT_ENTRY_MIN = 0.1;

function toDatePart(value: string): string {
    return value.split('T')[0] ?? value;
}

function findMetricOnOrBeforeDate(metrics: MetricEntry[], targetDate: string): MetricEntry | null {
    const sorted = metrics.slice().sort((a, b) => toDatePart(b.date).localeCompare(toDatePart(a.date)));
    return sorted.find((metric) => toDatePart(metric.date) <= targetDate) ?? null;
}

function formatWeightInput(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}

/**
 * Focused weigh-in bottom sheet used by Goals and deep-linked weight routes.
 */
export const WeightEntrySheet: React.FC<WeightEntrySheetProps> = ({ visible, date, onClose, onSaved }) => {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const [weight, setWeight] = useState('');
    const weightUnit = formatWeightUnit(user?.weight_unit);
    const metricsQuery = useQuery({
        queryKey: ['mobile-metrics'],
        queryFn: () => api.getMetrics(),
        enabled: visible
    });

    const existingMetric = useMemo(() => {
        return (metricsQuery.data ?? []).find((metric) => toDatePart(metric.date) === date) ?? null;
    }, [date, metricsQuery.data]);

    const prefillMetric = useMemo(() => {
        if (existingMetric) return existingMetric;
        return findMetricOnOrBeforeDate(metricsQuery.data ?? [], date);
    }, [date, existingMetric, metricsQuery.data]);

    useEffect(() => {
        if (!visible) return;
        if (!prefillMetric) {
            setWeight('');
            return;
        }
        setWeight(formatWeightInput(prefillMetric.weight));
    }, [date, prefillMetric?.id, prefillMetric?.weight, visible]);

    const addWeight = useMutation({
        mutationFn: () => api.addMetric({ weight: Number(weight), date }),
        onSuccess: async () => {
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

    const deleteWeight = useMutation({
        mutationFn: () => {
            if (!existingMetric) {
                throw new Error('No weight entry exists for this day.');
            }
            return api.deleteMetric(existingMetric.id);
        },
        onSuccess: async () => {
            setWeight('');
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-metrics-trend'] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-profile'] })
            ]);
            onSaved?.();
            onClose();
        }
    });

    const parsedWeight = Number(weight);
    const canSave = Number.isFinite(parsedWeight) && parsedWeight >= WEIGHT_ENTRY_MIN;
    const isBusy = metricsQuery.isLoading || addWeight.isPending || deleteWeight.isPending;
    const loadError = metricsQuery.error instanceof Error ? metricsQuery.error.message : null;
    const saveError = addWeight.error instanceof Error ? addWeight.error.message : null;
    const deleteError = deleteWeight.error instanceof Error ? deleteWeight.error.message : null;

    return (
        <BottomSheetModal visible={visible} onRequestClose={onClose}>
            <SectionHeader title="Log weight" description={`${formatDateOnlyForDisplay(date)} | ${weightUnit}`} />
            {existingMetric && (
                <AppText variant="muted">Editing the weigh-in already saved for this day.</AppText>
            )}
            {!existingMetric && prefillMetric && (
                <AppText variant="muted">
                    Defaulted from {formatDateOnlyForDisplay(toDatePart(prefillMetric.date))}.
                </AppText>
            )}
            <NumberStepperField
                label="Weight"
                value={weight}
                onChangeText={setWeight}
                step={WEIGHT_ENTRY_STEP}
                min={WEIGHT_ENTRY_MIN}
                suffix={weightUnit}
                editable={!isBusy}
            />
            {(loadError || saveError || deleteError) && (
                <AppText style={styles.error}>{loadError ?? saveError ?? deleteError}</AppText>
            )}
            {existingMetric && (
                <AppButton
                    title={deleteWeight.isPending ? 'Deleting...' : 'Delete weigh-in'}
                    variant="ghost"
                    disabled={isBusy}
                    leftIcon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
                    onPress={() => deleteWeight.mutate()}
                />
            )}
            <View style={styles.row}>
                <AppButton
                    title="Cancel"
                    variant="secondary"
                    leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                    onPress={onClose}
                    style={styles.rowButton}
                />
                <AppButton
                    title={addWeight.isPending ? 'Saving...' : existingMetric ? 'Save weight' : 'Log weight'}
                    disabled={!canSave || isBusy}
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
