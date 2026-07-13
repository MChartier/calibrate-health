import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppCard } from './AppCard';
import { SkeletonBlock } from './SkeletonBlock';
import { radius, spacing } from '../theme';

/**
 * Glimmer layout for the selected day's log content.
 *
 * The shape mirrors the calorie card, meal timeline, and completion row so date changes do not flash the whole pane.
 */
export const LogContentSkeleton: React.FC = () => (
    <>
        <AppCard>
            <View style={styles.metricLine}>
                <SkeletonBlock width="34%" height={64} />
                <SkeletonBlock width="18%" height={30} />
                <SkeletonBlock width="24%" height={30} />
            </View>
            <SkeletonBlock height={10} radius={radius.pill} />
            <SkeletonBlock width="54%" height={18} style={styles.centered} />
            <SkeletonBlock height={52} />
        </AppCard>

        <AppCard>
            <SkeletonBlock width="42%" height={32} />
            {[0, 1, 2, 3].map((row) => (
                <View key={row} style={styles.mealRow}>
                    <SkeletonBlock width={42} height={42} radius={21} />
                    <View style={styles.mealText}>
                        <SkeletonBlock width="62%" height={24} />
                        <SkeletonBlock width="38%" height={18} />
                    </View>
                    <SkeletonBlock width={58} height={32} />
                </View>
            ))}
        </AppCard>

        <AppCard style={styles.completionCard}>
            <SkeletonBlock width={40} height={40} />
            <SkeletonBlock width="42%" height={24} />
            <SkeletonBlock width={54} height={32} radius={radius.pill} />
        </AppCard>
    </>
);

const styles = StyleSheet.create({
    metricLine: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm
    },
    centered: {
        alignSelf: 'center'
    },
    mealRow: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    mealText: {
        flex: 1,
        gap: spacing.sm
    },
    completionCard: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    }
});
