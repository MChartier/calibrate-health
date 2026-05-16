import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { getTodayDate } from '../../src/utils/dates';
import { spacing } from '../../src/theme';

export default function WeightScreen() {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const today = useMemo(() => getTodayDate(user?.timezone), [user?.timezone]);
    const [weight, setWeight] = useState('');
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });
    const addWeight = useMutation({
        mutationFn: () => api.addMetric({ weight: Number(weight), date: today }),
        onSuccess: async () => {
            setWeight('');
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await queryClient.invalidateQueries({ queryKey: ['mobile-metrics'] });
            await queryClient.invalidateQueries({ queryKey: ['mobile-profile'] });
        }
    });

    const canSave = Number.isFinite(Number(weight)) && Number(weight) > 0;

    return (
        <Screen>
            <View>
                <AppText variant="title">Weight</AppText>
                <AppText variant="muted">Daily weigh-in | {user?.weight_unit ?? 'KG'}</AppText>
            </View>

            <AppCard>
                <TextField label={`Weight (${user?.weight_unit ?? 'KG'})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
                <AppButton title={addWeight.isPending ? 'Saving...' : 'Save weigh-in'} disabled={!canSave || addWeight.isPending} onPress={() => addWeight.mutate()} />
            </AppCard>

            {(metricsQuery.data ?? []).slice(0, 14).map((entry) => (
                <AppCard key={entry.id} style={styles.rowCard}>
                    <View>
                        <AppText variant="subtitle">{entry.weight}</AppText>
                        <AppText variant="muted">{entry.date.split('T')[0]}</AppText>
                    </View>
                </AppCard>
            ))}
        </Screen>
    );
}

const styles = StyleSheet.create({
    rowCard: {
        gap: spacing.sm
    }
});
