/**
 * Exercises settings home behavior and regression boundaries.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { HEIGHT_UNITS, WEIGHT_UNITS } from '@calibrate/shared';
import { ASYNC_RESOURCE_STATES } from '../asyncState/resolveAsyncState';
import { SettingsHome, shouldShowSettingsResourceStatus } from './SettingsHome';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

jest.mock('../config/nativeClient', () => ({
    MOBILE_CLIENT_IDENTITY: { version: '0.0.0-test' }
}));

describe('SettingsHome', () => {
    it('defers the web cached-offline announcement to the global PWA status', () => {
        const stale = { kind: ASYNC_RESOURCE_STATES.STALE, error: null } as const;
        const error = { kind: ASYNC_RESOURCE_STATES.ERROR, error: null } as const;

        expect(shouldShowSettingsResourceStatus(stale, true)).toBe(false);
        expect(shouldShowSettingsResourceStatus(stale, false)).toBe(true);
        expect(shouldShowSettingsResourceStatus(error, true)).toBe(true);
    });

    it('exposes the registered Settings child destinations', () => {
        const onOpenActivity = jest.fn();
        const onOpenSavedFoods = jest.fn();
        const onOpenAbout = jest.fn();
        const onOpenAdvanced = jest.fn();
        const onOpenProductLink = jest.fn();
        const onDeleteAccount = jest.fn();
        const onOpenSheet = jest.fn();
        const screen = render(
            <SettingsHome
                email="person@example.invalid"
                emailVerified={false}
                goalSummary="Maintain weight"
                weightUnit={WEIGHT_UNITS.KG}
                heightUnit={HEIGHT_UNITS.CM}
                isOutboxReady
                failedMutationCount={0}
                pendingMutationCount={0}
                isWeb
                onEditProfile={jest.fn()}
                onOpenSheet={onOpenSheet}
                onOpenActivity={onOpenActivity}
                onOpenSavedFoods={onOpenSavedFoods}
                onOpenAbout={onOpenAbout}
                onOpenAdvanced={onOpenAdvanced}
                onOpenProductLink={onOpenProductLink}
                onDeleteAccount={onDeleteAccount}
                onLogout={jest.fn()}
            />
        );

        fireEvent.press(screen.getByRole('button', { name: 'Activity' }));
        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));
        fireEvent.press(screen.getByRole('button', { name: 'About Calibrate' }));
        fireEvent.press(screen.getByRole('button', { name: 'Support and feedback' }));
        fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
        fireEvent.press(screen.getByRole('button', { name: 'Terms of service' }));
        fireEvent.press(screen.getByRole('button', { name: 'Open-source licenses' }));
        fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
        fireEvent.press(screen.getByRole('button', { name: 'Advanced settings' }));

        expect(onOpenActivity).toHaveBeenCalledTimes(1);
        expect(onOpenSavedFoods).toHaveBeenCalledTimes(1);
        expect(onOpenAbout).toHaveBeenCalledTimes(1);
        expect(onOpenProductLink.mock.calls).toEqual([
            ['support'],
            ['privacy'],
            ['terms'],
            ['licenses']
        ]);
        expect(onDeleteAccount).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Action required')).toBeTruthy();
        expect(screen.getByTestId('settings-section-account')).toBeTruthy();
        expect(screen.getByTestId('settings-section-personal')).toBeTruthy();
        expect(screen.getByTestId('settings-section-connections')).toBeTruthy();
        expect(screen.getByTestId('settings-section-security')).toBeTruthy();
        expect(screen.getByTestId('settings-section-data')).toBeTruthy();
        expect(screen.getByTestId('settings-section-help')).toBeTruthy();
        expect(screen.getByTestId('settings-section-app')).toBeTruthy();
        expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
    });

    it('routes native self-hosting controls through the Advanced settings page', () => {
        const onOpenAdvanced = jest.fn();
        const screen = render(
            <SettingsHome
                email="person@example.invalid"
                goalSummary="Maintain weight"
                weightUnit={WEIGHT_UNITS.KG}
                heightUnit={HEIGHT_UNITS.CM}
                isOutboxReady
                failedMutationCount={0}
                pendingMutationCount={0}
                isWeb={false}
                onEditProfile={jest.fn()}
                onOpenSheet={jest.fn()}
                onOpenActivity={jest.fn()}
                onOpenSavedFoods={jest.fn()}
                onOpenAbout={jest.fn()}
                onOpenAdvanced={onOpenAdvanced}
                onOpenProductLink={jest.fn()}
                onDeleteAccount={jest.fn()}
                onLogout={jest.fn()}
            />
        );

        expect(screen.queryByText('Calibrate server')).toBeNull();
        fireEvent.press(screen.getByRole('button', { name: 'Advanced settings' }));
        expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
    });
});
