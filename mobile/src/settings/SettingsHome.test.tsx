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
        const screen = render(
            <SettingsHome
                email="person@example.invalid"
                goalSummary="Maintain weight"
                weightUnit={WEIGHT_UNITS.KG}
                heightUnit={HEIGHT_UNITS.CM}
                isOutboxReady
                failedMutationCount={0}
                pendingMutationCount={0}
                isWeb
                serverUrl="https://calibratehealth.app"
                onEditProfile={jest.fn()}
                onOpenSheet={jest.fn()}
                onOpenActivity={onOpenActivity}
                onOpenSavedFoods={onOpenSavedFoods}
                onOpenAbout={onOpenAbout}
                onLogout={jest.fn()}
            />
        );

        fireEvent.press(screen.getByRole('button', { name: 'Activity' }));
        fireEvent.press(screen.getByRole('button', { name: 'Saved foods' }));
        fireEvent.press(screen.getByRole('button', { name: 'About Calibrate' }));

        expect(onOpenActivity).toHaveBeenCalledTimes(1);
        expect(onOpenSavedFoods).toHaveBeenCalledTimes(1);
        expect(onOpenAbout).toHaveBeenCalledTimes(1);
    });
});
