import React from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

export const TextField: React.FC<TextInputProps & { label: string }> = ({ label, style, ...props }) => (
    <View style={styles.group}>
        <AppText variant="muted">{label}</AppText>
        <TextInput
            {...props}
            placeholderTextColor={colors.muted}
            style={[styles.input, style]}
        />
    </View>
);

const styles = StyleSheet.create({
    group: {
        gap: spacing.sm
    },
    input: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        color: colors.text,
        fontSize: 16
    }
});
