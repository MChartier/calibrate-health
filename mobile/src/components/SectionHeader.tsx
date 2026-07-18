import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { spacing } from '../theme';
import { AppText } from './AppText';

type SectionHeaderProps = ViewProps & {
    title: string;
    eyebrow?: string;
    description?: string;
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Compact header pattern shared by native screens and cards.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    eyebrow,
    description,
    headingLevel = 2,
    style,
    ...props
}) => (
    <View {...props} style={[styles.root, style]}>
        {eyebrow && <AppText variant="label">{eyebrow}</AppText>}
        <AppText accessibilityRole="header" aria-level={headingLevel} variant="screenTitle">{title}</AppText>
        {description && <AppText variant="muted">{description}</AppText>}
    </View>
);

const styles = StyleSheet.create({
    root: {
        gap: spacing.xs
    }
});
