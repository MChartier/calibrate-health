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

    it('shows the two-section web landing page and opens each category in order', () => {
        const onOpenCategory = jest.fn();
        const screen = render(
            <SettingsHome
                serverUrl="https://calibratehealth.app"
                isServerAdmin={false}
                onOpenService={jest.fn()}
                onOpenAdmin={jest.fn()}
                email="person@example.invalid"
                goalSummary="Maintain weight"
                weightUnit={WEIGHT_UNITS.KG}
                heightUnit={HEIGHT_UNITS.CM}
                sessionCount={3}
                connectedAppCount={1}
                isOutboxReady
                failedMutationCount={2}
                pendingMutationCount={4}
                isWeb
                onOpenCategory={onOpenCategory}
            />
        );

        expect(screen.getAllByTestId(/^settings-section-/).map((section) => section.props.testID)).toEqual([
            'settings-section-account',
            'settings-section-categories'
        ]);
        expect(screen.getByText('person@example.invalid')).toBeTruthy();
        expect(screen.getByText('Maintain weight')).toBeTruthy();

        const categoryButtons = screen.getAllByRole('button');
        expect(categoryButtons.map((button) => button.props.accessibilityLabel)).toEqual([
            'Service & hosting',
            'Profile & preferences, kg | cm',
            'Security & access, 3 sessions',
            'Connections, 1 assistant',
            'Data & privacy, 2 failed',
            'Help & app'
        ]);
        expect(screen.getByText('Personal details, photo, units, reminders, and haptics')).toBeTruthy();
        expect(screen.getByText('Password, signed-in devices, and sign-out')).toBeTruthy();
        expect(screen.getByText('Activity, health data, companion devices, and assistants')).toBeTruthy();
        expect(screen.getByText('Saved foods, imports, offline changes, export, and deletion')).toBeTruthy();
        expect(screen.getByText(
            'Support, legal documents, app information, and updates'
        )).toBeTruthy();

        categoryButtons.forEach((button) => fireEvent.press(button));
        expect(onOpenCategory.mock.calls).toEqual([
            ['profile'],
            ['security'],
            ['connections'],
            ['data'],
            ['help']
        ]);
    });

    it('shows native summaries and opens each category in order', () => {
        const onOpenCategory = jest.fn();
        const screen = render(
            <SettingsHome
                serverUrl="https://calibratehealth.app"
                isServerAdmin={false}
                onOpenService={jest.fn()}
                onOpenAdmin={jest.fn()}
                email="native@example.invalid"
                goalSummary="Lose 1 lb per week"
                weightUnit={WEIGHT_UNITS.LB}
                heightUnit={HEIGHT_UNITS.FT_IN}
                sessionCount={1}
                connectedAppCount={2}
                isOutboxReady
                failedMutationCount={0}
                pendingMutationCount={4}
                isWeb={false}
                onOpenCategory={onOpenCategory}
            />
        );

        expect(screen.getAllByTestId(/^settings-section-/).map((section) => section.props.testID)).toEqual([
            'settings-section-account',
            'settings-section-categories'
        ]);

        const categoryButtons = screen.getAllByRole('button');
        expect(categoryButtons.map((button) => button.props.accessibilityLabel)).toEqual([
            'Service & hosting',
            'Profile & preferences, lb | ft/in',
            'Security & access, 1 session',
            'Connections, 2 assistants',
            'Data & privacy, 4 pending',
            'Help & app, v0.0.0-test'
        ]);

        categoryButtons.forEach((button) => fireEvent.press(button));
        expect(onOpenCategory.mock.calls).toEqual([
            ['profile'],
            ['security'],
            ['connections'],
            ['data'],
            ['help']
        ]);
    });
    it('makes the current self-hosted service and role-appropriate admin entry discoverable', () => {
        const onOpenService = jest.fn();
        const onOpenAdmin = jest.fn();
        const props = {
            serverUrl: 'https://self.example', isServerAdmin: false, onOpenService, onOpenAdmin,
            goalSummary: 'Maintain weight', weightUnit: WEIGHT_UNITS.KG, heightUnit: HEIGHT_UNITS.CM,
            isOutboxReady: true, failedMutationCount: 0, pendingMutationCount: 0, isWeb: false,
            onOpenCategory: jest.fn()
        };
        const screen = render(<SettingsHome {...props} />);
        expect(screen.getByText('Self-hosted | https://self.example')).toBeTruthy();
        expect(screen.queryByText('Server administration')).toBeNull();
        fireEvent.press(screen.getByText('Service & hosting'));
        expect(onOpenService).toHaveBeenCalledTimes(1);
        screen.rerender(<SettingsHome {...props} isServerAdmin />);
        fireEvent.press(screen.getByText('Server administration'));
        expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    });

});
