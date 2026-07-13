import React from 'react';
import { render } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import { useAuth } from './AuthContext';
import { Link, useLocalSearchParams } from 'expo-router';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../account/accountDeletionNotice', () => ({ accountDeletionCleanupGuidance: jest.fn(() => '') }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
jest.mock('expo-router', () => {
    const ReactActual = jest.requireActual<typeof React>('react');
    return {
        useLocalSearchParams: jest.fn(),
        Link: jest.fn(({ children }: { children: React.ReactElement }) =>
            ReactActual.createElement(ReactActual.Fragment, null, children))
    };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;
const mockLink = Link as unknown as jest.Mock;
const SELF_HOSTED_URL = 'http://127.0.0.1:3300';

function authContextStub() {
    return {
        register: jest.fn(async () => undefined),
        login: jest.fn(async () => undefined),
        serverUrl: 'http://10.0.2.2:3000',
        setServerUrl: jest.fn(async () => true),
        testServerUrl: jest.fn(async () => true),
        serverConnection: {
            status: 'connected' as const,
            testedInput: SELF_HOSTED_URL,
            testedUrl: SELF_HOSTED_URL,
            message: 'Connected to Calibrate 1.0.0 (API v1).'
        },
        authError: null,
        accountDeletionCleanupNotice: null,
        acknowledgeAccountDeletionCleanupNotice: jest.fn(async () => undefined)
    };
}

function expectAuthLink(pathname: string) {
    const linkProps = mockLink.mock.calls[0][0];
    expect(linkProps.href).toEqual({
        pathname,
        params: { serverUrl: SELF_HOSTED_URL }
    });
    expect(linkProps.children.props.accessibilityRole).toBe('link');
}

describe('auth screen server navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseLocalSearchParams.mockReturnValue({ serverUrl: SELF_HOSTED_URL });
        mockUseAuth.mockReturnValue(authContextStub() as unknown as ReturnType<typeof useAuth>);
    });

    it('carries the login server draft into the registration link', () => {
        const screen = render(<LoginScreen />);

        expect(screen.getByText(SELF_HOSTED_URL)).toBeTruthy();
        expectAuthLink('/(auth)/register');
    });

    it('carries the registration server draft back to the login link', () => {
        const screen = render(<RegisterScreen />);

        expect(screen.getByText(SELF_HOSTED_URL)).toBeTruthy();
        expectAuthLink('/(auth)/login');
    });
});
