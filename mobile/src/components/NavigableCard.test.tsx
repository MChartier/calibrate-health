/**
 * Exercises navigable card behavior and regression boundaries.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { themes } from '../theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { NavigableCard } from './NavigableCard';

describe('NavigableCard', () => {
    it('keeps the primary surface and secondary action as independent sibling targets', () => {
        const onNavigate = jest.fn();
        const onSecondaryAction = jest.fn();
        const screen = render(
            <NavigableCard
                accessibilityLabel="Open food log"
                onPress={onNavigate}
                primaryActionTestID="primary-target"
                secondaryAction={<AppButton title="Add food" onPress={onSecondaryAction} />}
                secondaryActionTestID="secondary-region"
                testID="card-surface"
            >
                <AppText>Food log</AppText>
            </NavigableCard>
        );

        fireEvent.press(screen.getByRole('button', { name: 'Add food' }));
        expect(onSecondaryAction).toHaveBeenCalledTimes(1);
        expect(onNavigate).not.toHaveBeenCalled();

        fireEvent.press(screen.getByRole('link', { name: 'Open food log' }));
        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('primary-target')).toHaveStyle({ minHeight: 48, flex: 1 });
        expect(screen.getByTestId('secondary-region')).toHaveStyle({ minHeight: 48 });
    });

    it('supports a full-width footer action without nesting it in the primary target', () => {
        const screen = render(
            <NavigableCard
                accessibilityLabel="Open food log"
                secondaryAction={<AppButton title="Add food" />}
                secondaryActionPlacement="footer"
                secondaryActionTestID="footer-region"
                testID="card-surface"
            >
                <AppText>Food log</AppText>
            </NavigableCard>
        );

        expect(screen.getByTestId('card-surface')).toHaveStyle({ flexDirection: 'column' });
        expect(screen.getByTestId('footer-region')).toHaveStyle({
            width: '100%',
            borderLeftWidth: 0,
            borderTopColor: themes.light.colors.outlineVariant
        });
    });

    it('exposes selected, busy, disabled, and keyboard-focus states', () => {
        const screen = render(
            <NavigableCard
                accessibilityLabel="Open trend"
                busy
                selected
                testID="card-surface"
            >
                <AppText>Trend</AppText>
            </NavigableCard>
        );
        const target = screen.getByRole('link', { name: 'Open trend' });

        expect(target.props.accessibilityState).toEqual(expect.objectContaining({
            busy: true,
            disabled: true,
            selected: true
        }));
        expect(screen.getByTestId('card-surface')).toHaveStyle({
            backgroundColor: themes.light.colors.selectionContainer,
            borderColor: themes.light.colors.selection,
            opacity: themes.light.interaction.busyOpacity
        });

        const disabledScreen = render(
            <NavigableCard accessibilityLabel="Open disabled card" disabled testID="disabled-surface">
                <AppText>Disabled card</AppText>
            </NavigableCard>
        );
        expect(disabledScreen.getByRole('link', { name: 'Open disabled card' }).props.accessibilityState).toEqual(
            expect.objectContaining({ busy: false, disabled: true })
        );
        expect(disabledScreen.getByTestId('disabled-surface')).toHaveStyle({
            opacity: themes.light.interaction.disabledOpacity
        });

        const focusedScreen = render(
            <NavigableCard accessibilityLabel="Open snapshot" testID="focused-surface">
                <AppText>Snapshot</AppText>
            </NavigableCard>
        );
        const focusedTarget = focusedScreen.getByRole('link', { name: 'Open snapshot' });
        expect(focusedTarget.props.android_ripple).toBeUndefined();
        fireEvent(focusedTarget, 'pressIn');
        expect(StyleSheet.flatten(focusedScreen.getByTestId('focused-surface').props.style)).toEqual(expect.objectContaining({
            backgroundColor: themes.light.colors.surfacePressed,
            borderColor: themes.light.colors.outline,
            elevation: 0
        }));

        fireEvent(focusedTarget, 'pressOut');
        fireEvent(focusedTarget, 'focus');
        expect(StyleSheet.flatten(focusedScreen.getByTestId('focused-surface').props.style)).toEqual(expect.objectContaining({
            borderColor: themes.light.colors.outline,
            outlineColor: themes.light.colors.focusRing,
            outlineStyle: 'solid',
            outlineWidth: themes.light.interaction.focusRingWidth
        }));
    });
});
