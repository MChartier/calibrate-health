import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type DayCompletionCardProps = ViewProps & {
    isComplete: boolean;
    isBusy?: boolean;
    onToggle: () => void;
};

/**
 * Compact day-completion control that mirrors the PWA completion row while
 * making the reminder-suppression behavior explicit on mobile.
 */
export const DayCompletionCard: React.FC<DayCompletionCardProps> = ({
    isComplete,
    isBusy,
    onToggle,
    style,
    ...props
}) => (
    <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isComplete, disabled: isBusy }}
        accessibilityLabel={isComplete ? 'Reopen day' : 'Mark day complete'}
        disabled={isBusy}
        onPress={onToggle}
        style={({ pressed }) => [pressed && styles.pressed]}
    >
        <AppCard {...props} style={[styles.card, isComplete && styles.cardComplete, style]}>
            <View style={styles.left}>
                <View style={[styles.iconTile, isComplete && styles.iconTileComplete]}>
                    <Ionicons
                        name={isComplete ? 'checkmark' : 'ellipse-outline'}
                        size={22}
                        color={isComplete ? '#ffffff' : colors.muted}
                    />
                </View>
                <View style={styles.textGroup}>
                    <AppText variant="subtitle" numberOfLines={1} adjustsFontSizeToFit>
                        {isComplete ? 'Today complete' : 'Mark today complete'}
                    </AppText>
                    <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit>
                        {isComplete ? 'Food-log reminders are paused.' : 'Stops food-log reminders for today.'}
                    </AppText>
                </View>
            </View>
            <View style={[styles.statePill, isComplete && styles.statePillComplete]}>
                <AppText style={[styles.statePillText, isComplete && styles.statePillTextComplete]}>
                    {isComplete ? 'Complete' : 'Not complete'}
                </AppText>
            </View>
        </AppCard>
    </Pressable>
);

const styles = StyleSheet.create({
    card: {
        minHeight: 74,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderColor: colors.border,
        gap: spacing.md
    },
    cardComplete: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySoft
    },
    left: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    textGroup: {
        flex: 1,
        minWidth: 0
    },
    iconTile: {
        width: 38,
        height: 38,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt
    },
    iconTileComplete: {
        backgroundColor: colors.primary
    },
    statePill: {
        width: 110,
        alignItems: 'center',
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs
    },
    statePillComplete: {
        backgroundColor: colors.primary
    },
    statePillText: {
        color: colors.muted,
        fontSize: 12,
        fontWeight: '900'
    },
    statePillTextComplete: {
        color: '#ffffff'
    },
    pressed: {
        opacity: 0.84
    }
});
