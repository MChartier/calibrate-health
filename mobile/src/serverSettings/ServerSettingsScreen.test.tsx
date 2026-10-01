import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@calibrate/api-client';
import { AppText } from '../components/AppText';
import ServerSettingsScreen from './ServerSettingsScreen';
import { serverSettingsQueryKey, useServerSettings } from './useServerSettings';

const mockApi = {
    getServerSettings: jest.fn(), updateServerSettings: jest.fn(), getClientConfig: jest.fn(),
    getServerUsers: jest.fn(), updateServerUserRole: jest.fn()
};
const initialUsers = [
    { id: 1, email: 'admin@example.com', role: 'admin', email_verified: true, created_at: '2026-09-01T00:00:00Z' },
    { id: 2, email: 'member@example.com', role: 'member', email_verified: true, created_at: '2026-09-02T00:00:00Z' },
    { id: 3, email: 'unverified@example.com', role: 'member', email_verified: false, created_at: '2026-09-03T00:00:00Z' }
];
let mockUsers = initialUsers.map((user) => ({ ...user }));
const clientConfig = {
    server_version: '1.2.3', api_versions: { current: 'v1', supported: ['v1'] },
    min_supported_mobile_version: '0.2.0', min_supported_wear_version: '0.1.0',
    capabilities: { native_push: true, health_connect_activity: false, wear_os_ready: true }
};
let mockServerUrl = 'https://one.example';
let mockUser: { id: number } | null = { id: 1 };
let mockOnline = true;
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({
    api: mockApi, user: mockUser, serverUrl: mockServerUrl, isLoading: false
}) }));
jest.mock('expo-router', () => ({ Redirect: () => null, Link: require('react-native').Text }));
jest.mock('../components/BottomSheetModal', () => ({
    BottomSheetModal: ({ visible, title, children }: { visible: boolean; title: string; children: React.ReactNode }) => {
        const { View, Text } = require('react-native');
        return visible ? <View accessibilityLabel={title}><Text>{title}</Text>{children}</View> : null;
    }
}));
jest.mock('../components/TabScreen', () => ({ TabScreen: require('react-native').View }));
jest.mock('../components/AsyncStateBoundary', () => ({ useOnlineStatus: () => mockOnline }));

const response = (enabled: boolean, admin = true) => ({
    features: { nutrition_label_scanning: enabled }, is_admin: admin
});
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    const tree = () => <QueryClientProvider client={client}><ServerSettingsScreen /></QueryClientProvider>;
    const screen = render(tree());
    return { screen, client, tree };
}
// React Query schedules observer notifications outside component event handlers.
beforeAll(() => notifyManager.setNotifyFunction((callback) => act(callback)));
afterAll(() => notifyManager.setNotifyFunction((callback) => callback()));
beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockApi).forEach((mock) => mock.mockReset());
    mockServerUrl = 'https://one.example';
    mockUser = { id: 1 };
    mockOnline = true;
    mockUsers = initialUsers.map((user) => ({ ...user }));
    mockApi.getClientConfig.mockResolvedValue(clientConfig);
    mockApi.getServerUsers.mockImplementation(async () => ({ users: mockUsers, next_cursor: null }));
    mockApi.updateServerUserRole.mockImplementation(async (id: number, role: string) => {
        mockUsers = mockUsers.map((user) => user.id === id ? { ...user, role } : user);
        return { user: mockUsers.find((user) => user.id === id) };
    });
    mockApi.getServerSettings.mockResolvedValue(response(false));
    mockApi.updateServerSettings.mockImplementation(async (features) => ({ features, is_admin: true }));
});
afterEach(cleanup);

test('admin can enable and disable the server setting and sees the persisted result', async () => {
    const { screen } = setup();
    const toggle = await screen.findByRole('switch', { name: 'Nutrition label scanning' });
    expect(toggle.props.accessibilityState.checked).toBe(false);
    fireEvent.press(toggle);
    await waitFor(() => expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(true));
    expect(mockApi.updateServerSettings).toHaveBeenLastCalledWith({ nutrition_label_scanning: true }, expect.anything());
    fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(false));
    expect(mockApi.updateServerSettings).toHaveBeenLastCalledWith({ nutrition_label_scanning: false }, expect.anything());
});

test('a direct admin URL does not expose controls to a non-admin', async () => {
    mockApi.getServerSettings.mockResolvedValue(response(false, false));
    const { screen } = setup();
    await screen.findByText(/administrator access is required/);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockApi.updateServerSettings).not.toHaveBeenCalled();
    expect(mockApi.getClientConfig).not.toHaveBeenCalled();
    expect(mockApi.getServerUsers).not.toHaveBeenCalled();
    expect(screen.queryByText('Users and roles')).toBeNull();
});

test('failed saves retain the server value and permit retry', async () => {
    mockApi.updateServerSettings.mockRejectedValueOnce(new Error('Unavailable'));
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('switch'));
    await screen.findByText('The setting could not be saved. Try again.');
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(true));
});

test('loading and failed configuration never expose a toggle and can be retried', async () => {
    mockApi.getServerSettings.mockRejectedValueOnce(new Error('Unavailable'));
    const { screen } = setup();
    expect(screen.queryByRole('switch')).toBeNull();
    await screen.findByText('Server settings could not be loaded.');
    fireEvent.press(screen.getByText('Try again'));
    await screen.findByRole('switch');
});

test('offline administration cannot send a mutation', async () => {
    mockOnline = false;
    const { screen } = setup();
    expect(screen.getByText('Connect to the server to manage its settings.')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockApi.updateServerSettings).not.toHaveBeenCalled();
});

test('feature reads fail closed after refresh errors and never cross server or account boundaries', async () => {
    mockApi.getServerSettings.mockResolvedValue(response(true));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    function Probe() {
        const settings = useServerSettings();
        return <AppText>{settings.nutritionLabelScanning ? 'enabled' : 'disabled'}</AppText>;
    }
    const tree = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
    const screen = render(tree());
    await screen.findByText('enabled');
    mockApi.getServerSettings.mockRejectedValue(new Error('Unavailable'));
    await act(async () => { await client.invalidateQueries({ queryKey: serverSettingsQueryKey(mockServerUrl, 1) }); });
    await screen.findByText('disabled');
    mockApi.getServerSettings.mockImplementation(() => new Promise(() => {}));
    mockServerUrl = 'https://two.example';
    screen.rerender(tree());
    expect(screen.getByText('disabled')).toBeTruthy();
    mockUser = { id: 2 };
    screen.rerender(tree());
    expect(screen.getByText('disabled')).toBeTruthy();
});

test('server overview reports actual capabilities and refresh failures hide stale details', async () => {
    const { screen } = setup();
    await screen.findByText('1.2.3');
    expect(screen.getByText('Not reported')).toBeTruthy();
    expect(mockApi.getClientConfig).toHaveBeenCalledWith({ cache: 'no-store' });
    mockApi.getClientConfig.mockRejectedValueOnce(new Error('Unavailable'));
    fireEvent.press(screen.getByText('Check server again'));
    await screen.findByText('Server details could not be checked. Check your connection and try again.');
    expect(screen.queryByText('1.2.3')).toBeNull();
    expect(screen.queryByText('Client capabilities')).toBeNull();
    fireEvent.press(screen.getByText('Check server again'));
    await screen.findByText('1.2.3');
});

test('role changes require explicit confirmation and cancellation sends nothing', async () => {
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    expect(screen.getByText('Make this member an administrator?')).toBeTruthy();
    expect(mockApi.updateServerUserRole).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Confirm administrator access')).toBeNull();
    expect(mockApi.updateServerUserRole).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Make administrator: member@example.com' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm administrator access' }));
    await screen.findByText('member@example.com: Administrator role saved.');
    await screen.findByRole('button', { name: 'Make member: member@example.com' });
    expect(mockApi.updateServerUserRole).toHaveBeenCalledTimes(1);
    expect(mockApi.updateServerUserRole).toHaveBeenCalledWith(2, 'admin', expect.anything());
    expect(mockApi.getServerUsers.mock.calls.length).toBeGreaterThan(1);
    expect(mockApi.getServerSettings.mock.calls.length).toBeGreaterThan(1);
});

test('unverified members cannot be promoted', async () => {
    const { screen } = setup();
    const action = await screen.findByRole('button', { name: 'Make administrator: unverified@example.com' });
    expect(action.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(action);
    expect(screen.queryByText('Confirm administrator access')).toBeNull();
    expect(screen.getByText('Verify email before granting administrator access.')).toBeTruthy();
});

test.each([
    ['LAST_ADMIN_REQUIRED', 'Keep at least one verified administrator. Make another verified member an administrator before removing this role.'],
    ['EMAIL_VERIFICATION_REQUIRED', 'This member must verify their email before becoming an administrator.']
])('role error %s stays inside the confirmation with safe actionable copy', async (code, message) => {
    mockApi.updateServerUserRole.mockRejectedValueOnce(new ApiError('secret internal detail', 409, { code }));
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make member: admin@example.com' }));
    expect(screen.getByText(/You are removing your own administrator access/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Confirm member role' }));
    await screen.findByText(message);
    expect(screen.queryByText('secret internal detail')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm member role' }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(message)).toBeNull();
});

test('removing your own administrator role hides the entire administration surface', async () => {
    mockApi.getServerSettings.mockImplementation(async () => response(false, mockUsers[0].role === 'admin'));
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make member: admin@example.com' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm member role' }));
    await screen.findByText(/administrator access is required/);
    expect(screen.queryByText('admin@example.com (you)')).toBeNull();
    expect(screen.queryByText('Server details')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
});

test('directory search resets pagination and does not show results from the previous search', async () => {
    mockApi.getServerUsers.mockImplementation(async ({ search, cursor }) => {
        if (search) return { users: [], next_cursor: null };
        if (cursor) return { users: [mockUsers[1]], next_cursor: null };
        return { users: [mockUsers[0]], next_cursor: 1 };
    });
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Load more users' }));
    await screen.findByText('member@example.com');
    expect(mockApi.getServerUsers).toHaveBeenCalledWith({ search: undefined, cursor: 1, limit: 25 }, expect.anything());
    fireEvent.changeText(screen.getByLabelText('Search users by email'), '  absent@example.com  ');
    fireEvent.press(screen.getByRole('button', { name: 'Search users' }));
    await screen.findByText('No users match this email search.');
    expect(screen.queryByText('admin@example.com (you)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more users' })).toBeNull();
    expect(mockApi.getServerUsers).toHaveBeenLastCalledWith({ search: 'absent@example.com', cursor: undefined, limit: 25 }, expect.anything());
});

test('a directory refresh failure hides cached user data until retry succeeds', async () => {
    const { screen } = setup();
    await screen.findByText('admin@example.com (you)');
    mockApi.getServerUsers.mockRejectedValueOnce(new Error('private details'));
    fireEvent.press(screen.getByRole('button', { name: 'Refresh user list' }));
    await screen.findByText('The user list could not be loaded. Try again.');
    expect(screen.queryByText('admin@example.com (you)')).toBeNull();
    expect(screen.queryByText('private details')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry user list' }));
    await screen.findByText('admin@example.com (you)');
});

test('an authorization failure rechecks permissions and hides administrative data', async () => {
    const { screen } = setup();
    await screen.findByText('admin@example.com (you)');
    mockApi.getServerUsers.mockRejectedValueOnce(new ApiError('private details', 403, { code: 'ADMIN_REQUIRED' }));
    mockApi.getServerSettings.mockResolvedValue(response(false, false));
    fireEvent.press(screen.getByRole('button', { name: 'Refresh user list' }));
    await screen.findByText(/administrator access is required/);
    expect(screen.queryByText('admin@example.com (you)')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
});

test('repeated role confirmation cannot send a duplicate change while the request is pending', async () => {
    let resolveChange!: (result: unknown) => void;
    mockApi.updateServerUserRole.mockImplementation(() => new Promise((resolve) => { resolveChange = resolve; }));
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    const confirm = screen.getByRole('button', { name: 'Confirm administrator access' });
    act(() => {
        fireEvent.press(confirm);
        fireEvent.press(confirm);
    });
    const pending = await screen.findByRole('button', { name: 'Changing role...' });
    fireEvent.press(pending);
    expect(screen.getByRole('button', { name: 'Cancel' }).props.accessibilityState.disabled).toBe(true);
    expect(mockApi.updateServerUserRole).toHaveBeenCalledTimes(1);
    await act(async () => resolveChange({ user: { ...mockUsers[1], role: 'admin' } }));
});

test('changing server and account clears pending confirmation and save feedback', async () => {
    let resolveChange!: (result: unknown) => void;
    mockApi.updateServerUserRole.mockImplementation(() => new Promise((resolve) => { resolveChange = resolve; }));
    const { screen, tree } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm administrator access' }));
    await screen.findByText('Changing role...');
    mockServerUrl = 'https://two.example';
    mockUser = { id: 4 };
    mockApi.getServerUsers.mockResolvedValue({ users: [{ ...mockUsers[1], id: 4, email: 'different@example.com' }], next_cursor: null });
    screen.rerender(tree());
    await screen.findByText('different@example.com (you)');
    expect(mockApi.updateServerUserRole.mock.calls[0][2].aborted).toBe(true);
    expect(screen.queryByText('Changing role...')).toBeNull();
    expect(screen.queryByText('member@example.com')).toBeNull();
    await act(async () => resolveChange({ user: { ...initialUsers[1], role: 'admin' } }));
    expect(screen.queryByText('member@example.com: Administrator role saved.')).toBeNull();
    expect(screen.getByText('different@example.com (you)')).toBeTruthy();
});

test('a role authorization failure immediately hides all admin data while permissions are rechecked', async () => {
    const { screen } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    mockApi.getServerSettings.mockImplementation(() => new Promise(() => {}));
    mockApi.updateServerUserRole.mockRejectedValueOnce(new ApiError('private details', 403, { code: 'ADMIN_REQUIRED' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm administrator access' }));
    await screen.findByText('Administrator access could not be confirmed. Check your server permissions again.');
    expect(screen.queryByText('member@example.com')).toBeNull();
    expect(screen.queryByText('Server details')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('private details')).toBeNull();
});

test('permissions can be checked again after a denied directory request', async () => {
    const { screen } = setup();
    await screen.findByText('admin@example.com (you)');
    mockApi.getServerUsers.mockRejectedValueOnce(new ApiError('denied', 403, { code: 'ADMIN_REQUIRED' }));
    fireEvent.press(screen.getByRole('button', { name: 'Refresh user list' }));
    const recheck = await screen.findByRole('button', { name: 'Check permissions' });
    await waitFor(() => expect(recheck.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(recheck);
    await screen.findByText('admin@example.com (you)');
    expect(screen.queryByText('Administrator access could not be confirmed. Check your server permissions again.')).toBeNull();
});

test('offline transition closes role confirmation without sending changes', async () => {
    const { screen, tree } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    expect(screen.getByText('Confirm administrator access')).toBeTruthy();
    mockOnline = false;
    screen.rerender(tree());
    expect(screen.getByText('Connect to the server to manage its settings.')).toBeTruthy();
    expect(screen.queryByText('Confirm administrator access')).toBeNull();
    expect(screen.queryByText('member@example.com')).toBeNull();
    mockOnline = true;
    screen.rerender(tree());
    await screen.findByText('admin@example.com (you)');
    expect(screen.queryByText('Confirm administrator access')).toBeNull();
    expect(mockApi.updateServerUserRole).not.toHaveBeenCalled();
});

test('a refreshed role invalidates an older open confirmation', async () => {
    const { screen, client } = setup();
    fireEvent.press(await screen.findByRole('button', { name: 'Make administrator: member@example.com' }));
    mockUsers = mockUsers.map((user) => user.id === 2 ? { ...user, role: 'admin' } : user);
    await act(async () => { await client.invalidateQueries({ queryKey: ['server-administration', mockServerUrl, 1, 'users'] }); });
    fireEvent.press(screen.getByRole('button', { name: 'Confirm administrator access' }));
    await screen.findByText('This account changed. Review its current role before trying again.');
    expect(mockApi.updateServerUserRole).not.toHaveBeenCalled();
});

test('an older server has actionable directory fallback without fabricated role data', async () => {
    mockApi.getServerUsers.mockRejectedValue(new ApiError('not found', 404, {}));
    const { screen } = setup();
    await screen.findByText('This server does not support user management yet. Update the server to manage roles here.');
    expect(screen.queryByText('admin@example.com (you)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make administrator: member@example.com' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Nutrition label scanning' })).toBeTruthy();
});

test('a late feature-save response cannot restore access after self-demotion', async () => {
    let resolveSetting!: (result: unknown) => void;
    mockApi.updateServerSettings.mockImplementation(() => new Promise((resolve) => { resolveSetting = resolve; }));
    mockApi.getServerSettings.mockImplementation(async () => response(false, mockUsers[0].role === 'admin'));
    const { screen, client } = setup();
    fireEvent.press(await screen.findByRole('switch', { name: 'Nutrition label scanning' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Make member: admin@example.com' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm member role' }));
    await screen.findByText(/administrator access is required/);
    await act(async () => resolveSetting(response(true, true)));
    expect(client.getQueryData<{ is_admin: boolean }>(serverSettingsQueryKey(mockServerUrl, 1))?.is_admin).toBe(false);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Users and roles')).toBeNull();
    expect(screen.queryByText('Server details')).toBeNull();
});

test('a save from a logged-out scope cannot refill admin cache after signing in again', async () => {
    let resolveSetting!: (result: unknown) => void;
    mockApi.updateServerSettings.mockImplementation(() => new Promise((resolve) => { resolveSetting = resolve; }));
    const { screen, client, tree } = setup();
    fireEvent.press(await screen.findByRole('switch', { name: 'Nutrition label scanning' }));
    await screen.findByText('Saving setting...');
    mockUser = null;
    screen.rerender(tree());
    act(() => client.clear());
    expect(mockApi.updateServerSettings.mock.calls[0][1].aborted).toBe(true);
    mockUser = { id: 1 };
    mockApi.getServerSettings.mockImplementation(() => new Promise(() => {}));
    screen.rerender(tree());
    expect(screen.getByText('Loading server settings...')).toBeTruthy();
    await act(async () => resolveSetting(response(true, true)));
    expect(client.getQueryData(serverSettingsQueryKey(mockServerUrl, 1))).toBeUndefined();
    expect(screen.getByText('Loading server settings...')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
});
