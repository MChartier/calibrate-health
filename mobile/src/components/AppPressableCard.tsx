import React from 'react';
import { type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { NavigableCard } from './NavigableCard';

type AppPressableCardProps = Omit<PressableProps, 'accessibilityLabel' | 'android_ripple' | 'children' | 'style'> & {
    accessibilityLabel: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

/** @deprecated Prefer NavigableCard, which also supports reserved secondary actions. */
export const AppPressableCard: React.FC<AppPressableCardProps> = ({
    children,
    style,
    accessibilityLabel,
    testID,
    ...props
}) => (
    <NavigableCard
        {...props}
        accessibilityLabel={accessibilityLabel}
        contentStyle={style}
        primaryActionTestID={testID}
    >
        {children}
    </NavigableCard>
);
