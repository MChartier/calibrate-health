import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { colors } from '../theme';

export const AppText: React.FC<TextProps & { variant?: 'title' | 'subtitle' | 'body' | 'muted' }> = ({
    style,
    variant = 'body',
    ...props
}) => <Text {...props} style={[styles.base, styles[variant], style]} />;

const styles = StyleSheet.create({
    base: {
        color: colors.text
    },
    title: {
        fontSize: 28,
        fontWeight: '800'
    },
    subtitle: {
        fontSize: 18,
        fontWeight: '700'
    },
    body: {
        fontSize: 16
    },
    muted: {
        color: colors.muted,
        fontSize: 14
    }
});
