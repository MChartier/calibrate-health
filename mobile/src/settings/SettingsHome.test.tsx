import { fireEvent, render } from '@testing-library/react-native';
import { HEIGHT_UNITS, WEIGHT_UNITS } from '@calibrate/shared';
import { SettingsHome } from './SettingsHome';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

jest.mock('../config/nativeClient', () => ({
    MOBILE_CLIENT_IDENTITY: { version: '0.0.0-test' }
}));

describe('SettingsHome', () => {
    it('exposes the registered Settings child destinations', () => {
        const onOpenActivity = jest.fn();
        const onOpenSavedFoods = jest.fn();
        const onOpenAbout = jest.fn();
        const onOpenProductLink = jest.fn();
        const onDeleteAccount = jest.fn();
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
                onOpenSheet={jest.fn()}
                onOpenActivity={onOpenActivity}
                onOpenSavedFoods={onOpenSavedFoods}
                onOpenAbout={onOpenAbout}
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
        expect(screen.queryByRole('button', { name: 'Advanced' })).toBeNull();
    });

    it('keeps native self-hosting controls behind a generic Advanced entry', () => {
        const onOpenSheet = jest.fn();
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
                onOpenSheet={onOpenSheet}
                onOpenActivity={jest.fn()}
                onOpenSavedFoods={jest.fn()}
                onOpenAbout={jest.fn()}
                onOpenProductLink={jest.fn()}
                onDeleteAccount={jest.fn()}
                onLogout={jest.fn()}
            />
        );

        expect(screen.queryByText('Calibrate server')).toBeNull();
        fireEvent.press(screen.getByRole('button', { name: 'Advanced' }));
        expect(onOpenSheet).toHaveBeenCalledWith('advanced');
    });
});
