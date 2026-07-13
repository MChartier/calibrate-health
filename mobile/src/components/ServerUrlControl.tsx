import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { TextField } from './TextField';
import { colors, radius, spacing } from '../theme';
import {
    HOSTED_SERVER_URL,
    normalizeServerUrl,
    type ServerConnectionState
} from '../config/server';

type ServerUrlControlProps = ViewProps & {
    value: string;
    onChangeText: (value: string) => void;
    connection: ServerConnectionState;
    onTestConnection: (value: string) => Promise<boolean>;
};

const resolveStatusPresentation = (status: ServerConnectionState['status']): {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
} => {
    switch (status) {
        case 'connected':
            return { icon: 'checkmark-circle', color: colors.success };
        case 'error':
            return { icon: 'alert-circle', color: colors.danger };
        case 'testing':
            return { icon: 'sync-circle', color: colors.info };
        default:
            return { icon: 'information-circle', color: colors.muted };
    }
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
    connection,
    onTestConnection,
    style,
    ...props
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const normalizedValue = normalizeServerUrl(value);
    const matchesTestedCandidate = normalizedValue
        ? normalizedValue === connection.testedUrl
        : value.trim() === connection.testedInput;
    const visibleConnection = matchesTestedCandidate
        ? connection
        : {
              status: 'idle' as const,
              testedInput: null,
              testedUrl: null,
              message: 'Test this address before signing in.'
          };
    const statusPresentation = resolveStatusPresentation(visibleConnection.status);
    const isTesting = visibleConnection.status === 'testing';

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
                <View style={styles.editor}>
                    <TextField
                        label="Server URL"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        value={value}
                        onChangeText={onChangeText}
                        helperText="Remote servers require HTTPS. Localhost, 10.0.2.2, and private LAN addresses may use HTTP."
                    />
                    <View style={styles.editorActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Use hosted Calibrate server"
                            onPress={() => onChangeText(HOSTED_SERVER_URL)}
                            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                        >
                            <AppText style={styles.secondaryActionText}>Use hosted</AppText>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Test Calibrate server connection"
                            disabled={isTesting}
                            onPress={() => void onTestConnection(value)}
                            style={({ pressed }) => [
                                styles.testAction,
                                isTesting && styles.disabled,
                                pressed && !isTesting && styles.pressed
                            ]}
                        >
                            <Ionicons name="pulse" size={16} color={colors.surface} />
                            <AppText style={styles.testActionText}>{isTesting ? 'Testing...' : 'Test connection'}</AppText>
                        </Pressable>
                    </View>
                </View>
            )}

            <View
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={visibleConnection.message}
                style={styles.connectionStatus}
            >
                <Ionicons name={statusPresentation.icon} size={17} color={statusPresentation.color} />
                <AppText style={[styles.connectionStatusText, { color: statusPresentation.color }]}>
                    {visibleConnection.message}
                </AppText>
            </View>
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
    editor: {
        gap: spacing.md
    },
    editorActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: spacing.md
    },
    secondaryAction: {
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md
    },
    secondaryActionText: {
        color: colors.primaryDark,
        fontWeight: '800'
    },
    testAction: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: colors.primary
    },
    testActionText: {
        color: colors.surface,
        fontWeight: '800'
    },
    connectionStatus: {
        minHeight: 22,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    connectionStatusText: {
        flex: 1,
        fontSize: 12
    },
    disabled: {
        opacity: 0.55
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    }
});
