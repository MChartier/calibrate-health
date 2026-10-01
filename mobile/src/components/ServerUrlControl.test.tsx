import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { BottomSheetModal } from './BottomSheetModal';
import { ServerUrlControl } from './ServerUrlControl';
import { HOSTED_SERVER_URL, INITIAL_SERVER_CONNECTION_STATE } from '../config/server';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../hooks/useReducedMotionPreference', () => ({ useReducedMotionPreference: () => true }));

function setup(overrides: Partial<React.ComponentProps<typeof ServerUrlControl>> = {}) {
    const props = {
        value: HOSTED_SERVER_URL,
        connection: INITIAL_SERVER_CONNECTION_STATE,
        onTestConnection: jest.fn(async () => true),
        onConfirmServer: jest.fn(async () => true),
        onEditingChange: jest.fn(),
        ...overrides
    };
    return { ...render(<ServerUrlControl {...props} />), props };
}

test('managed hosting needs no URL entry and self-hosting is discoverable', () => {
    const screen = setup();
    expect(screen.getByText('Managed hosting. No server setup needed.')).toBeTruthy();
    expect(screen.queryByLabelText('Server URL')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Use a self-hosted server' }));
    expect(screen.getByLabelText('Server URL')).toHaveProp('value', '');
    expect(screen.getByRole('radio', { name: 'Self-hosted server' })).toHaveProp('accessibilityState', { checked: true, disabled: false });
});

test('testing and canceling a draft never changes the selected service', async () => {
    const screen = setup();
    fireEvent.press(screen.getByText('Use a self-hosted server'));
    fireEvent.changeText(screen.getByLabelText('Server URL'), 'https://self.example');
    fireEvent.press(screen.getByText('Test connection'));
    await waitFor(() => expect(screen.props.onTestConnection).toHaveBeenCalledWith('https://self.example'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.props.onConfirmServer).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Use a self-hosted server'));
    expect(screen.getByLabelText('Server URL')).toHaveProp('value', '');
});

test('a failed confirmation stays in the chooser and allows retry', async () => {
    const onConfirmServer = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const screen = setup({ value: 'https://self.example', onConfirmServer });
    expect(screen.getByText('https://self.example')).toBeTruthy();
    fireEvent.press(screen.getByText('Change service'));
    fireEvent.press(screen.getByText('Use this service'));
    await waitFor(() => expect(onConfirmServer).toHaveBeenCalledTimes(1));
    await screen.findByText('Could not confirm this service. Check the address and connection details, then try again.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use this service' })).not.toBeDisabled());
    fireEvent.press(screen.getByText('Use this service'));
    await waitFor(() => expect(onConfirmServer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.UNSAFE_getByType(BottomSheetModal).props.visible).toBe(false));
});

test('returning to managed hosting is explicit and explains sign-out before switching', async () => {
    const screen = setup({ value: 'https://self.example', switchingAccount: true });
    fireEvent.press(screen.getByText('Change service'));
    fireEvent.press(screen.getByRole('radio', { name: 'Calibrate' }));
    expect(screen.getByText(/Switching signs you out/)).toBeTruthy();
    expect(screen.getByText(HOSTED_SERVER_URL)).toBeTruthy();
    fireEvent.press(screen.getByText('Switch service and sign out'));
    await waitFor(() => expect(screen.props.onConfirmServer).toHaveBeenCalledWith(HOSTED_SERVER_URL));
});

test('does not replay confirmation for repeated presses or allow a changing destination in flight', async () => {
    let finish!: (success: boolean) => void;
    const screen = setup({ value: 'https://self.example', onConfirmServer: jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })) });
    fireEvent.press(screen.getByText('Change service'));
    fireEvent.press(screen.getByText('Use this service'));
    fireEvent.press(screen.getByText('Checking service...'));
    expect(screen.props.onConfirmServer).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Server URL')).toHaveProp('editable', false);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => finish(true));
});

test('never shows success from a different candidate', () => {
    const screen = setup({ value: 'https://new.example', connection: {
        status: 'connected', testedInput: 'https://old.example', testedUrl: 'https://old.example', message: 'Old connection succeeded'
    } });
    fireEvent.press(screen.getByText('Change service'));
    expect(screen.queryByText('Old connection succeeded')).toBeNull();
});
