import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import ForgotPasswordRoute from '../../app/forgot-password';

const mockNativeReset = jest.fn(async () => undefined);
const mockBrowserReset = jest.fn(async () => undefined);
const mockTest = jest.fn(async () => true);
const mockClient = jest.fn();
jest.mock('@calibrate/api-client', () => ({ CalibrateApiClient: class {
    constructor(options: unknown) { mockClient(options); }
    requestPasswordReset = mockNativeReset;
} }));
jest.mock('./AuthContext', () => ({ useAuth: () => ({
    api: { requestPasswordReset: mockBrowserReset }, serverUrl: 'https://saved.example', testServerUrl: mockTest
}) }));
jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ serverUrl: 'https://chosen.example' }),
    Link: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('../config/nativeClient', () => ({ MOBILE_CLIENT_IDENTITY: { platform: 'android', version: '1.0.0' } }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
beforeEach(() => { jest.clearAllMocks(); mockTest.mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

async function submit() {
    const screen = render(<ForgotPasswordRoute />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.com');
    await act(async () => fireEvent.press(screen.getByText('Send reset instructions')));
    return screen;
}

test('native password recovery probes and sends only to the chosen sign-in host', async () => {
    await submit();
    await waitFor(() => expect(mockNativeReset).toHaveBeenCalledWith({ email: 'person@example.com' }));
    expect(mockTest).toHaveBeenCalledWith('https://chosen.example');
    expect(mockClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://chosen.example' }));
    expect(mockBrowserReset).not.toHaveBeenCalled();
});

test('failed server confirmation never transmits the recovery email', async () => {
    mockTest.mockResolvedValue(false);
    const screen = await submit();
    await screen.findByText('Could not confirm this service. Check its address from sign in and try again.');
    expect(mockNativeReset).not.toHaveBeenCalled();
    expect(mockBrowserReset).not.toHaveBeenCalled();
});

test('web ignores routed hosts and keeps cookie-bound recovery on its serving origin', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await submit();
    await waitFor(() => expect(mockBrowserReset).toHaveBeenCalled());
    expect(mockTest).toHaveBeenCalledWith('https://saved.example');
    expect(mockClient).not.toHaveBeenCalled();
});
