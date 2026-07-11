import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MetricEntry, UserClientPayload } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';
import { formatWeight } from '../utils/format';

type WeightStatusCardProps = ViewProps & {
    latestMetric: MetricEntry | null | undefined;
    user: UserClientPayload | null;
    onEditWeight: () => void;
};

function formatMetricDate(value: string | null | undefined): string {
    if (!value) return '-';
    const dateOnly = value.split('T')[0] ?? value;
    const [yearString, monthString, dayString] = dateOnly.split('-');
    const date = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
    if (Number.isNaN(date.getTime())) return dateOnly;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * Native counterpart to the top PWA Weight card: latest weight and quick weigh-in action.
 */
export const WeightStatusCard: React.FC<WeightStatusCardProps> = ({
    latestMetric,
    user,
    onEditWeight,
    style,
    ...props
}) => {
    return (
        <AppCard {...props} style={style}>
            <View style={styles.header}>
                <AppText variant="screenTitle">Weight</AppText>
                <AppButton
                    title="Log weight"
                    variant="secondary"
                    leftIcon={<Ionicons name="pencil" size={18} color={colors.primaryDark} />}
                    onPress={onEditWeight}
                    style={styles.editButton}
                />
            </View>
            <View style={styles.latestRow}>
                <View style={styles.iconTile}>
                    <Ionicons name="scale-outline" size={22} color={colors.primaryDark} />
                </View>
                <View style={styles.latestText}>
                    <AppText style={styles.latestWeight}>{formatWeight(latestMetric?.weight, user?.weight_unit)}</AppText>
                    <AppText variant="muted">As of {formatMetricDate(latestMetric?.date)}</AppText>
                </View>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    editButton: {
        minHeight: 36,
        paddingHorizontal: spacing.md
    },
    latestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg
    },
    iconTile: {
        width: 52,
        height: 52,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    latestText: {
        flex: 1,
        minWidth: 0
    },
    latestWeight: {
        color: colors.text,
        fontSize: 34,
        lineHeight: 40,
        fontWeight: '900'
    }
});
