import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
    <View style={styles.root}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="muted">{label}</AppText>
    </View>
);

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        backgroundColor: colors.background
    }
});
