import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import ServiceSettingsScreen from '../../app/(tabs)/(settings)/service';
import { HOSTED_SERVER_URL } from '../config/server';

let mockAuth: Record<string, unknown>;
let mockOutbox: Record<string, unknown>;
let mockAdmin = false;
const mockPush = jest.fn();
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../offline/provider', () => ({ useOfflineOutbox: () => mockOutbox }));
jest.mock('../serverSettings/useServerSettings', () => ({ useServerSettings: () => ({ isAdmin: mockAdmin }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../components/TabScreen', () => ({ TabScreen: require('react-native').View }));
jest.mock('../hooks/useReducedMotionPreference', () => ({ useReducedMotionPreference: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { serverUrl: HOSTED_SERVER_URL, user: { email: 'owner@example.com' },
        serverConnection: { status: 'idle', testedUrl: null },
        testServerUrl: jest.fn(async () => true), setServerUrl: jest.fn(async () => true) };
    mockOutbox = { isReady: true, initializationError: null, mutations: [] };
    mockAdmin = false;
});
afterEach(() => jest.restoreAllMocks());

test('shows managed account context without exposing admin controls to ordinary users', () => {
    const screen = render(<ServiceSettingsScreen />);
    expect(screen.getByText('Calibrate managed hosting')).toBeTruthy();
    expect(screen.queryByText('Open server administration')).toBeNull();
    expect(screen.getByText('Signed in as owner@example.com')).toBeTruthy();
});

test('blocks switching when offline writes could be lost and links to review', () => {
    mockOutbox.mutations = [{ id: 'pending' }];
    const screen = render(<ServiceSettingsScreen />);
    expect(screen.getByRole('button', { name: 'Use a self-hosted server' })).toBeDisabled();
    fireEvent.press(screen.getByText('Review offline changes'));
    expect(mockPush).toHaveBeenCalledWith('/data');
    expect(mockAuth.setServerUrl).not.toHaveBeenCalled();
});

test('requires explicit confirmation and preserves account if switching fails', async () => {
    mockAuth.setServerUrl = jest.fn(async () => false);
    const screen = render(<ServiceSettingsScreen />);
    fireEvent.press(screen.getByText('Use a self-hosted server'));
    fireEvent.changeText(screen.getByLabelText('Server URL'), 'https://self.example');
    expect(screen.getByText(/Switching signs you out/)).toBeTruthy();
    expect(mockAuth.setServerUrl).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Switch service and sign out'));
    await waitFor(() => expect(mockAuth.setServerUrl).toHaveBeenCalledWith('https://self.example'));
    await screen.findByText('Could not confirm this service. Check the address and connection details, then try again.');
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Signed in as owner@example.com')).toBeTruthy();
});

test('web stays on its origin and admins get a dedicated administration entry', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockAuth.serverUrl = 'https://self.example';
    mockAdmin = true;
    const screen = render(<ServiceSettingsScreen />);
    expect(screen.queryByText('Change service')).toBeNull();
    expect(screen.getByText(/This browser stays connected/)).toBeTruthy();
    fireEvent.press(screen.getByText('Open server administration'));
    expect(mockPush).toHaveBeenCalledWith('/server-admin');
});
