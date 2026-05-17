import React from 'react';
import { Pressable, StyleSheet, Switch, View, type ViewProps } from 'react-native';
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
        <AppCard {...props} style={[styles.card, style]}>
            <View style={styles.left}>
                <View style={[styles.iconTile, isComplete && styles.iconTileComplete]}>
                    <Ionicons
                        name={isComplete ? 'checkmark' : 'ellipse-outline'}
                        size={22}
                        color={isComplete ? '#ffffff' : colors.muted}
                    />
                </View>
                <View style={styles.textGroup}>
                    <AppText variant="subtitle">{isComplete ? 'Today complete' : 'Mark today complete'}</AppText>
                    <AppText variant="caption">
                        {isComplete ? 'Food-log reminders are paused.' : 'Stops food-log reminders for today.'}
                    </AppText>
                </View>
            </View>
            <Switch
                pointerEvents="none"
                value={isComplete}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={isComplete ? colors.primary : colors.muted}
            />
        </AppCard>
    </Pressable>
);

const styles = StyleSheet.create({
    card: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
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
    pressed: {
        opacity: 0.84
    }
});
