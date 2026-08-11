/**
 * Exercises public legal page behavior and regression boundaries.
 */
import { render } from '@testing-library/react-native';
import { PublicLegalPage } from './PublicLegalPage';

let mockUser: { id: number } | null = null;

jest.mock('../../auth/AuthContext', () => ({
    useAuth: () => ({ user: mockUser })
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

jest.mock('../CalibrateLogo', () => ({ CalibrateLogo: () => null }));

jest.mock('expo-router', () => {
    const ReactModule = require('react');
    const { Text } = require('react-native');
    return {
        Link: ({ children }: { children: React.ReactNode }) => ReactModule.createElement(Text, null, children)
    };
});

const props = {
    title: 'Privacy policy',
    lastUpdated: 'August 1, 2026',
    intro: ['How Calibrate handles account data.'],
    sections: [{ title: 'Your choices', paragraphs: ['Export or delete your account.'] }],
    links: [{ href: '/terms', label: 'Terms of service' }]
};

describe('PublicLegalPage', () => {
    it('uses a public trust shell while keeping signed-in recovery inside Settings', () => {
        const screen = render(<PublicLegalPage {...props} />);
        expect(screen.getByTestId('legal-public-shell')).toBeTruthy();
        expect(screen.getByTestId('legal-page')).toBeTruthy();
        expect(screen.getByRole('header', { name: 'Privacy policy' })).toBeTruthy();
        expect(screen.getByText('Calibrate home')).toBeTruthy();

        mockUser = { id: 7 };
        screen.rerender(<PublicLegalPage {...props} />);
        expect(screen.getByTestId('legal-in-app-shell')).toBeTruthy();
        expect(screen.getByText('Back to Settings')).toBeTruthy();
    });
});
