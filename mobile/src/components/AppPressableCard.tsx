import React from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { type AppTheme, useAppTheme } from '../theme';
import { AppCard } from './AppCard';

type AppPressableCardProps = Omit<PressableProps, 'android_ripple' | 'children' | 'style'> & {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

/** Rounded interactive card with one consistent state layer across native and web. */
export const AppPressableCard: React.FC<AppPressableCardProps> = ({
    children,
    disabled,
    style,
    ...props
}) => {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Pressable
            {...props}
            disabled={disabled}
            style={({ pressed }) => [styles.pressable, pressed && !disabled && styles.pressablePressed]}
        >
            {({ pressed }) => (
                <AppCard style={[style, pressed && !disabled && styles.cardPressed]}>
                    {children}
                </AppCard>
            )}
        </Pressable>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        pressable: {
            width: '100%',
            borderRadius: theme.radius.lg
        },
        pressablePressed: {
            transform: [{ translateY: 1 }]
        },
        cardPressed: {
            backgroundColor: theme.colors.surfacePressed,
            borderColor: theme.colors.outline,
            shadowOpacity: 0,
            elevation: 0
        }
    });
}
