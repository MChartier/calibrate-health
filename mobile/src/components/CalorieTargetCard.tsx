import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import type { UserProfileResponse } from '@calibrate/api-client';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { MetricTile } from './MetricTile';
import { SectionHeader } from './SectionHeader';
import { spacing } from '../theme';
import { formatCalories, formatSignedCalories } from '../utils/format';

type CalorieTargetCardProps = ViewProps & {
    profile: UserProfileResponse | null | undefined;
    onEditProfile?: () => void;
    onEditGoal?: () => void;
};

/**
 * Native version of the PWA calorie-target breakdown: BMR, activity/TDEE, goal delta, and target.
 */
export const CalorieTargetCard: React.FC<CalorieTargetCardProps> = ({
    profile,
    onEditProfile,
    onEditGoal,
    style,
    ...props
}) => {
    const summary = profile?.calorieSummary;
    const missing = summary?.missing ?? [];
    const hasTarget = typeof summary?.dailyCalorieTarget === 'number';
    const goalDelta = typeof summary?.deficit === 'number' ? -summary.deficit : null;

    return (
        <AppCard {...props} style={style}>
            <SectionHeader
                title="Calorie target"
                description={hasTarget ? 'How your daily budget is calculated.' : 'Complete setup to calculate a daily target.'}
            />
            <View style={styles.tileRow}>
                <MetricTile label="BMR" value={formatCalories(summary?.bmr)} />
                <MetricTile label="TDEE" value={formatCalories(summary?.tdee)} />
            </View>
            <View style={styles.tileRow}>
                <MetricTile label="goal delta" value={formatSignedCalories(goalDelta)} />
                <MetricTile label="daily target" value={formatCalories(summary?.dailyCalorieTarget)} tone={hasTarget ? 'success' : 'default'} />
            </View>
            {missing.length > 0 && (
                <AppText variant="muted">
                    Missing: {missing.join(', ')}.
                </AppText>
            )}
            <View style={styles.actions}>
                {onEditProfile && (
                    <AppButton
                        title="Edit profile"
                        variant="secondary"
                        onPress={onEditProfile}
                        style={styles.actionButton}
                    />
                )}
                {onEditGoal && (
                    <AppButton
                        title="Edit goal"
                        variant="secondary"
                        onPress={onEditGoal}
                        style={styles.actionButton}
                    />
                )}
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    tileRow: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md
    },
    actionButton: {
        flex: 1
    }
});
