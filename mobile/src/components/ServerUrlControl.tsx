import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText';
import { TextField } from './TextField';
import { radius, spacing, useAppTheme, type AppThemeColors, type AppTheme } from '../theme';
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
    presentation?: 'advanced' | 'editor';
};

const resolveStatusPresentation = (status: ServerConnectionState['status'], colors: AppThemeColors): {
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
            return { icon: 'information-circle', color: colors.onSurfaceVariant };
    }
};

/**
 * Hosted-first server selector for auth and Settings screens.
 *
 * Routine hosted flows expose only a generic Advanced disclosure. Self-hosted
 * and LAN testing flows retain the full URL editor and compatibility probe.
 */
export const ServerUrlControl: React.FC<ServerUrlControlProps> = ({
    value,
    onChangeText,
    connection,
    onTestConnection,
    presentation = 'advanced',
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [isEditing, setIsEditing] = useState(presentation === 'editor');
    const normalizedValue = normalizeServerUrl(value);
    const isHosted = normalizedValue === HOSTED_SERVER_URL;
    const matchesTestedCandidate = normalizedValue
        ? normalizedValue === connection.testedUrl
        : value.trim() === connection.testedInput;
    const visibleConnection = matchesTestedCandidate
        ? connection
        : {
              status: 'idle' as const,
              testedInput: null,
              testedUrl: null,
              message: 'Test this address before continuing.'
          };
    const statusPresentation = resolveStatusPresentation(visibleConnection.status, theme.colors);
    const isTesting = visibleConnection.status === 'testing';

    return (
        <View {...props} style={[styles.root, style]}>
            {presentation === 'advanced' && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isEditing
                        ? 'Hide advanced connection options'
                        : 'Show advanced connection options'}
                    accessibilityState={{ expanded: isEditing }}
                    aria-expanded={isEditing}
                    onPress={() => setIsEditing((current) => !current)}
                    style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
                >
                    <View style={styles.summaryText}>
                        <AppText variant="label">Advanced</AppText>
                        {!isHosted && <AppText variant="caption">Self-hosted service selected</AppText>}
                    </View>
                    <Ionicons
                        name={isEditing ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={theme.colors.primary}
                    />
                </Pressable>
            )}

            {isEditing && (
                <View style={styles.editor}>
                    <View style={styles.operatorNotice}>
                        <AppText variant="label">Self-hosted service</AppText>
                        <AppText variant="caption">
                            Its operator is responsible for privacy, security, availability, backups, and support.
                        </AppText>
                    </View>
                    <TextField
                        label="Server URL"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        value={value}
                        onChangeText={onChangeText}
                        helperText="Release builds require HTTPS. Local HTTP is limited to development builds."
                    />
                    <View style={styles.editorActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Use Calibrate hosted service"
                            onPress={() => onChangeText(HOSTED_SERVER_URL)}
                            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                        >
                            <AppText style={styles.secondaryActionText}>Use hosted service</AppText>
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
                            <Ionicons name="pulse" size={16} color={theme.colors.onPrimary} />
                            <AppText style={styles.testActionText}>{isTesting ? 'Testing...' : 'Test connection'}</AppText>
                        </Pressable>
                    </View>
                </View>
            )}

            {isEditing && (
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
            )}
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    root: {
        gap: spacing.sm
    },
    summary: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        borderColor: theme.colors.outlineVariant,
        borderWidth: theme.stroke.control,
        backgroundColor: theme.colors.surfaceContainer,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    summaryText: {
        flex: 1,
        minWidth: 0,
        gap: 2
    },
    editor: {
        gap: spacing.md
    },
    operatorNotice: {
        gap: spacing.xs
    },
    editorActions: {
        gap: spacing.sm
    },
    secondaryAction: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md
    },
    secondaryActionText: {
        color: theme.colors.primary,
        fontWeight: '800'
    },
    testAction: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: theme.colors.primary
    },
    testActionText: {
        color: theme.colors.onPrimary,
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
        backgroundColor: theme.colors.surfacePressed
    }
});
