import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MetricEntry, UserClientPayload } from '@calibrate/api-client';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { formatWeight } from '../../utils/format';
import { radius, spacing, useAppTheme } from '../../theme';

type ProgressOverviewCardProps = {
    latestMetric: MetricEntry | null | undefined;
    user: UserClientPayload | null;
    hasWeightToday: boolean;
    onLogWeight: () => void;
};

function formatMetricDate(value: string | null | undefined): string {
    if (!value) return 'No weigh-in yet';
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return datePart;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parsed);
}

export const ProgressOverviewCard: React.FC<ProgressOverviewCardProps> = ({
    latestMetric,
    user,
    hasWeightToday,
    onLogWeight
}) => {
    const { colors } = useAppTheme();

    return (
        <AppCard style={{ backgroundColor: colors.primaryContainer, borderColor: colors.outlineVariant }}>
            <View style={styles.headingRow}>
                <View style={styles.headingText}>
                    <AppText variant="label" style={{ color: colors.onPrimaryContainer }}>Progress snapshot</AppText>
                    <AppText variant="muted">Updated {formatMetricDate(latestMetric?.date)}</AppText>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={hasWeightToday ? "Edit today's weight" : 'Log weight'}
                    onPress={onLogWeight}
                    style={({ pressed }) => [
                        styles.logButton,
                        { borderColor: colors.outline, backgroundColor: colors.surface },
                        pressed && { backgroundColor: colors.surfacePressed }
                    ]}
                >
                    <Ionicons name="add" size={20} color={colors.primary} />
                    <AppText variant="body" style={[styles.logButtonText, { color: colors.primary }]}>
                        {hasWeightToday ? 'Edit' : 'Log'}
                    </AppText>
                </Pressable>
            </View>

            <View style={styles.weightRow}>
                <AppText variant="caption">Current weight</AppText>
                <AppText variant="metric" style={{ color: colors.onPrimaryContainer }}>
                    {formatWeight(latestMetric?.weight, user?.weight_unit)}
                </AppText>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    headingRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headingText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    logButton: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.lg
    },
    logButtonText: {
        fontWeight: '700'
    },
    weightRow: {
        alignItems: 'flex-start',
        gap: spacing.xs
    }
});
