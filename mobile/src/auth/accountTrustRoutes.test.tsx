import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import VerifyEmailRoute from '../../app/verify-email';
import { useAuth } from './AuthContext';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
jest.mock('expo-router', () => {
    const ReactActual = jest.requireActual<typeof React>('react');
    return {
        useLocalSearchParams: () => ({}),
        router: { replace: jest.fn() },
        Link: ({ children }: { children: React.ReactElement }) =>
            ReactActual.createElement(ReactActual.Fragment, null, children)
    };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('account trust routes', () => {
    it('keeps logout, support, export, and deletion discoverable for an unverified session', () => {
        const logout = jest.fn(async () => undefined);
        mockUseAuth.mockReturnValue({
            api: {
                confirmEmailVerification: jest.fn(),
                resendEmailVerification: jest.fn()
            },
            user: {
                id: 7,
                email: 'person@example.com',
                account_access: {
                    state: 'email_verification_required',
                    email_verified: false,
                    legal_current: true
                }
            },
            updateCurrentUser: jest.fn(),
            logout
        } as unknown as ReturnType<typeof useAuth>);

        const screen = render(<VerifyEmailRoute />);

        expect(screen.getByText('Support')).toBeTruthy();
        expect(screen.getByText('Account data and deletion')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
        fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
        expect(logout).toHaveBeenCalledTimes(1);
    });
});
