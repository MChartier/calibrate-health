import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { TextField } from './TextField';
import { colors, radius, spacing } from '../theme';

type ServerUrlControlProps = ViewProps & {
    value: string;
    onChangeText: (value: string) => void;
};

/**
 * Compact server selector for auth screens.
 *
 * Most users should see the active backend without losing half the form to a
 * rarely changed URL; self-hosted and LAN testing flows can still expand it.
 */
export const ServerUrlControl: React.FC<ServerUrlControlProps> = ({
    value,
    onChangeText,
    style,
    ...props
}) => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <View {...props} style={[styles.root, style]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={isEditing ? 'Hide server URL editor' : 'Change server URL'}
                onPress={() => setIsEditing((current) => !current)}
                style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
            >
                <View style={styles.summaryText}>
                    <AppText variant="label">Server</AppText>
                    <AppText numberOfLines={1} style={styles.urlText}>{value}</AppText>
                </View>
                <View style={styles.changeButton}>
                    <Ionicons name={isEditing ? 'chevron-up' : 'create-outline'} size={16} color={colors.primaryDark} />
                    <AppText style={styles.changeText}>{isEditing ? 'Hide' : 'Change'}</AppText>
                </View>
            </Pressable>

            {isEditing && (
                <TextField
                    label="Server URL"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={value}
                    onChangeText={onChangeText}
                    helperText="Use the hosted service or enter a LAN/self-hosted backend URL."
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        gap: spacing.sm
    },
    summary: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    summaryText: {
        flex: 1,
        minWidth: 0,
        gap: 2
    },
    urlText: {
        color: colors.text,
        fontWeight: '800'
    },
    changeButton: {
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    changeText: {
        color: colors.primaryDark,
        fontWeight: '900'
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    }
});
