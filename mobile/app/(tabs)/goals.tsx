import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DAILY_DEFICIT_CHOICE_ABS_VALUES } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, spacing } from '../../src/theme';

export default function GoalsScreen() {
    const { api, user } = useAuth();
    const queryClient = useQueryClient();
    const goalQuery = useQuery({ queryKey: ['mobile-goal'], queryFn: () => api.getGoals() });
    const [startWeight, setStartWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [dailyDeficit, setDailyDeficit] = useState('500');
    const saveGoal = useMutation({
        mutationFn: () =>
            api.createGoal({
                start_weight: Number(startWeight),
                target_weight: Number(targetWeight),
                daily_deficit: Number(dailyDeficit)
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-goal'] })
    });

    const canSave = Number(startWeight) > 0 && Number(targetWeight) > 0 && Number.isFinite(Number(dailyDeficit));

    return (
        <Screen>
            <View>
                <AppText variant="title">Goals</AppText>
                <AppText variant="muted">Weights are entered in {user?.weight_unit ?? 'KG'}.</AppText>
            </View>

            <AppCard>
                <AppText variant="subtitle">Current goal</AppText>
                {goalQuery.data ? (
                    <>
                        <AppText>{goalQuery.data.start_weight}{' -> '}{goalQuery.data.target_weight} {user?.weight_unit}</AppText>
                        <AppText variant="muted">Daily change: {goalQuery.data.daily_deficit} kcal</AppText>
                    </>
                ) : (
                    <AppText variant="muted">No goal configured yet.</AppText>
                )}
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">Set goal</AppText>
                <TextField label="Start weight" value={startWeight} onChangeText={setStartWeight} keyboardType="decimal-pad" />
                <TextField label="Target weight" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" />
                <View style={styles.chips}>
                    {[0, ...DAILY_DEFICIT_CHOICE_ABS_VALUES].map((value) => (
                        <AppButton
                            key={value}
                            title={String(value)}
                            variant={dailyDeficit === String(value) ? 'primary' : 'secondary'}
                            onPress={() => setDailyDeficit(String(value))}
                        />
                    ))}
                </View>
                {saveGoal.error && <AppText style={styles.error}>{saveGoal.error.message}</AppText>}
                <AppButton title={saveGoal.isPending ? 'Saving...' : 'Save goal'} disabled={!canSave || saveGoal.isPending} onPress={() => saveGoal.mutate()} />
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    error: {
        color: colors.danger
    }
});
