import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSection } from './AppSection';
import { AppCard } from './AppCard';
import { SkeletonBlock } from './SkeletonBlock';
import { radius, spacing, useAppTheme } from '../theme';

// Matches the supporting ring at the narrowest phone width.
const BALANCE_GAUGE_SKELETON_SIZE = 80;

/**
 * Glimmer layout for the selected day's log content.
 *
 * The shape mirrors the calorie, food, and weight summaries so date changes do not flash the whole pane.
 */
export const LogContentSkeleton: React.FC = () => {
    const { colors } = useAppTheme();
    return (
    <>
        <AppCard density="compact" testID="log-content-loading" style={{ backgroundColor: colors.summaryContainer, borderColor: colors.summaryOutline, elevation: 0, shadowOpacity: 0 }}>
            <View style={styles.metricLine}>
                <SkeletonBlock width={BALANCE_GAUGE_SKELETON_SIZE} height={BALANCE_GAUGE_SKELETON_SIZE} radius={radius.pill} />
                <View style={styles.balanceText}>
                    <SkeletonBlock width="100%" height={26} />
                    <SkeletonBlock width="85%" height={46} />
                    <SkeletonBlock width="90%" height={20} />
                </View>
            </View>
        </AppCard>

        <AppSection>
            <View style={styles.mealRow}>
                <SkeletonBlock width={40} height={40} />
                <View style={styles.mealText}>
                    <SkeletonBlock width="40%" height={20} />
                    <SkeletonBlock width="68%" height={26} />
                    <SkeletonBlock width="90%" height={24} />
                </View>
                <SkeletonBlock width={20} height={20} />
            </View>
            <SkeletonBlock height={48} />
        </AppSection>

        <AppSection>
            <View style={styles.mealRow}>
                <SkeletonBlock width={40} height={40} />
                <View style={styles.mealText}>
                    <SkeletonBlock width="48%" height={20} />
                    <SkeletonBlock width="58%" height={30} />
                    <SkeletonBlock width="52%" height={24} />
                </View>
                <SkeletonBlock width={20} height={20} />
            </View>
        </AppSection>
        <AppSection divider>
            <SkeletonBlock width="44%" height={20} />
            <SkeletonBlock width="85%" height={20} />
            <View style={styles.mealRow}>
                <View style={styles.mealText}><SkeletonBlock height={48} /></View>
                <View style={styles.mealText}><SkeletonBlock height={48} /></View>
            </View>
        </AppSection>
    </>
    );
};

const styles = StyleSheet.create({
    metricLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    balanceText: { flex: 1, minWidth: 0, gap: spacing.xs },
    mealRow: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm
    },
    mealText: {
        flex: 1,
        gap: spacing.xs
    }
});
