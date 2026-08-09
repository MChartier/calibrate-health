import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '../AppText';
import { CardHeader } from '../CardHeader';
import { useFocusVisible } from '../useFocusVisible';
import { radius, spacing, useAppTheme } from '../../theme';

type SettingsSectionProps = {
    title: string;
    description?: string;
    children: React.ReactNode;
    style?: ViewStyle;
};

type SettingsRowProps = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    supportingText?: string;
    value?: string;
    danger?: boolean;
    showDivider?: boolean;
    onPress: () => void;
};

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, description, children, style }) => {
    const { colors } = useAppTheme();

    return (
        <View style={[styles.section, style]}>
            <CardHeader
                title={title}
                metadata={description}
                density="compact"
                headingLevel={2}
                style={styles.sectionHeading}
            />
            <View style={[styles.sectionSurface, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
                {children}
            </View>
        </View>
    );
};

export const SettingsRow: React.FC<SettingsRowProps> = ({
    icon,
    label,
    supportingText,
    value,
    danger = false,
    showDivider = true,
    onPress
}) => {
    const theme = useAppTheme();
    const { colors } = theme;
    const [hovered, setHovered] = useState(false);
    const { focusVisible, handleFocus, handleBlur } = useFocusVisible();
    const iconColor = danger ? colors.danger : colors.primaryDark;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={value ? `${label}, ${value}` : label}
            onPress={onPress}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={({ pressed }) => [
                styles.row,
                showDivider && { borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth },
                hovered && { backgroundColor: colors.surfaceHovered },
                pressed && { backgroundColor: colors.surfacePressed },
                focusVisible && {
                    outlineColor: colors.focusRing,
                    outlineStyle: 'solid',
                    outlineWidth: theme.interaction.focusRingWidth
                }
            ]}
        >
            <View style={[
                styles.iconContainer,
                { backgroundColor: danger ? colors.dangerContainer : colors.primaryContainer }
            ]}>
                <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <View style={styles.rowText}>
                <AppText variant="body" style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</AppText>
                {supportingText && <AppText variant="caption">{supportingText}</AppText>}
            </View>
            {value && <AppText variant="muted" style={styles.rowValue}>{value}</AppText>}
            <Ionicons name="chevron-forward" size={18} color={danger ? colors.danger : colors.onSurfaceVariant} />
        </Pressable>
    );
};

const styles = StyleSheet.create({
    section: {
        gap: spacing.sm
    },
    sectionHeading: {
        paddingHorizontal: spacing.xs
    },
    sectionSurface: {
        overflow: 'hidden',
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth
    },
    row: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm
    },
    iconContainer: {
        width: 40,
        height: 40,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md
    },
    rowText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    rowLabel: {
        fontWeight: '700'
    },
    rowValue: {
        maxWidth: '32%',
        flexShrink: 1,
        textAlign: 'right'
    }
});
