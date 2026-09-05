import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PreferencesSettingsScreen from '../../app/(tabs)/(settings)/preferences';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useRouter: () => ({}) }));
jest.mock('../components/TabScreen', () => ({
    TabScreen: require('react-native').View
}));
jest.mock('../hooks/useNativePushRegistration', () => ({
    useNativePushRegistration: () => ({ state: 'unsupported' })
}));
jest.mock('../hooks/useConfirmDiscardNavigation', () => ({
    useConfirmDiscardNavigation: () => ({})
}));
jest.mock('../auth/AuthContext', () => ({
    useAuth: () => ({ user: mockUser, api: {}, updateCurrentUser: jest.fn() })
}));

const initialUser = {
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'America/Los_Angeles',
    reminder_log_food_enabled: true,
    reminder_log_weight_enabled: true,
    reminder_log_food_time: '09:00',
    reminder_log_weight_time: '09:00',
    reminder_quiet_hours_start: null,
    reminder_quiet_hours_end: null,
    haptics_enabled: true
};
let mockUser = { ...initialUser };

function editor(client: QueryClient) {
    return (
        <QueryClientProvider client={client}>
            <PreferencesSettingsScreen />
        </QueryClientProvider>
    );
}

describe('PreferencesSettingsScreen draft refresh', () => {
    beforeEach(() => { mockUser = { ...initialUser }; });
    afterEach(() => { jest.restoreAllMocks(); });

    it.each(['ios', 'android'] as const)('uses the %s notification status on the routed page', (platform) => {
        jest.replaceProperty(Platform, 'OS', platform);
        const client = new QueryClient();
        const screen = render(editor(client));
        const platformLabel = platform === 'ios' ? 'iOS' : 'Android';
        expect(screen.getByText(
            `Remote push is unavailable in Expo Go. Use a native ${platformLabel} development or release build.`
        )).toBeOnTheScreen();
        screen.unmount();
        client.clear();
    });

    it('preserves unsaved reminder input when account data refreshes', () => {
        const client = new QueryClient();
        const screen = render(editor(client));
        fireEvent.changeText(screen.getByTestId('settings-food-reminder-time'), '08:30');

        mockUser = { ...mockUser, reminder_log_food_time: '10:00', haptics_enabled: false };
        screen.rerender(editor(client));

        expect(screen.getByTestId('settings-food-reminder-time').props.value).toBe('08:30');
        expect(screen.getByRole('switch', { name: 'Haptics' })).toBeChecked();
        screen.unmount();
        client.clear();
    });

    it('refreshes an untouched editor without treating remote values as a draft', () => {
        const client = new QueryClient();
        const screen = render(editor(client));
        mockUser = { ...mockUser, reminder_log_food_time: '10:00' };
        screen.rerender(editor(client));
        expect(screen.getByTestId('settings-food-reminder-time').props.value).toBe('10:00');

        mockUser = { ...mockUser, reminder_log_food_time: '11:00' };
        screen.rerender(editor(client));
        expect(screen.getByTestId('settings-food-reminder-time').props.value).toBe('11:00');
        screen.unmount();
        client.clear();
    });
});
