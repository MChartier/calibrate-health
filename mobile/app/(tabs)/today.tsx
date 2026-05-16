import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { LoadingState } from '../../src/components/LoadingState';
import { Screen } from '../../src/components/Screen';
import { useAuth } from '../../src/auth/AuthContext';
import { getTodayDate } from '../../src/utils/dates';
import { colors, spacing } from '../../src/theme';

export default function TodayScreen() {
    const { api, user } = useAuth();
    const today = useMemo(() => getTodayDate(user?.timezone), [user?.timezone]);
    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', today], queryFn: () => api.getFoodLog(today) });
    const metricsQuery = useQuery({ queryKey: ['mobile-metrics'], queryFn: () => api.getMetrics() });
    const foodDayQuery = useQuery({ queryKey: ['mobile-food-day', today], queryFn: () => api.getFoodDay(today) });

    if (profileQuery.isLoading || foodQuery.isLoading || metricsQuery.isLoading) {
        return <LoadingState label="Loading today..." />;
    }

    const calories = (foodQuery.data ?? []).reduce((total, entry) => total + entry.calories, 0);
    const target = profileQuery.data?.calorieSummary.dailyCalorieTarget ?? null;
    const remaining = target === null ? null : target - calories;
    const latestWeight = metricsQuery.data?.[0]?.weight ?? null;

    return (
        <Screen>
            <View>
                <AppText variant="title">Today</AppText>
                <AppText variant="muted">{today}</AppText>
            </View>

            <AppCard>
                <AppText variant="subtitle">Calories</AppText>
                <View style={styles.metricRow}>
                    <View>
                        <AppText style={styles.metricValue}>{calories}</AppText>
                        <AppText variant="muted">eaten</AppText>
                    </View>
                    <View>
                        <AppText style={styles.metricValue}>{target ?? '-'}</AppText>
                        <AppText variant="muted">target</AppText>
                    </View>
                    <View>
                        <AppText style={[styles.metricValue, remaining !== null && remaining < 0 && styles.over]}>{remaining ?? '-'}</AppText>
                        <AppText variant="muted">remaining</AppText>
                    </View>
                </View>
                <AppText variant="muted">{foodDayQuery.data?.is_complete ? 'Food log complete' : 'Food log still open'}</AppText>
            </AppCard>

            <AppCard>
                <AppText variant="subtitle">Latest weight</AppText>
                <AppText style={styles.metricValue}>{latestWeight ?? '-'}</AppText>
                <AppText variant="muted">{user?.weight_unit ?? 'KG'}</AppText>
            </AppCard>

            <View style={styles.actions}>
                <AppButton title="Log food" onPress={() => router.push('/(tabs)/log')} />
                <AppButton title="Log weight" variant="secondary" onPress={() => router.push('/(tabs)/weight')} />
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    metricValue: {
        fontSize: 28,
        fontWeight: '900'
    },
    over: {
        color: colors.danger
    },
    actions: {
        gap: spacing.md
    }
});
