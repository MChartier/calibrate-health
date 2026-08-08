import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { AppText } from './AppText';
import { type AppTheme, useAppTheme } from '../theme';

type CompactCardHeaderProps = Omit<ViewProps, 'children'> & {
    title: string;
    metadata?: string | null;
    action?: ReactNode;
    headingTestID?: string;
};

/** A compact, consistent heading row for dashboard cards. */
export const CompactCardHeader: React.FC<CompactCardHeaderProps> = ({
    title,
    metadata,
    action,
    headingTestID,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View {...props} style={[styles.root, style]}>
            <View testID={headingTestID} style={styles.heading}>
                <AppText accessibilityRole="header" aria-level={2} variant="label" style={styles.title}>
                    {title}
                </AppText>
                {metadata ? (
                    <AppText variant="caption" style={styles.metadata}>
                        {metadata}
                    </AppText>
                ) : null}
            </View>
            {action}
        </View>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: theme.spacing.sm
        },
        heading: {
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.spacing.sm
        },
        title: {
            color: theme.colors.onSurface,
            fontWeight: '800'
        },
        metadata: {
            flexShrink: 1,
            color: theme.colors.onSurfaceVariant
        }
    });
}
