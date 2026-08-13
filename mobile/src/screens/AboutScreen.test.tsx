import type { ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { useAuth } from '../auth/AuthContext';
import { useAppUpdateController } from '../updates/useAppUpdateController';
import AboutScreen from '../../app/(tabs)/(settings)/about';

const mockRouter = {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn()
};
const mockLink = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => mockRouter,
    Link: (props: { children: ReactNode; href: unknown }) => {
        const ReactActual = jest.requireActual<typeof import('react')>('react');
        mockLink(props);
        return ReactActual.createElement(ReactActual.Fragment, null, props.children);
    }
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({
    __esModule: true,
    default: () => null
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
jest.mock('../components/CalibrateLogo', () => ({
    CalibrateLogo: () => null
}));
jest.mock('../auth/AuthContext', () => ({
    useAuth: jest.fn()
}));
jest.mock('../updates/useAppUpdateController', () => ({
    useAppUpdateController: jest.fn()
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseAppUpdateController = jest.mocked(useAppUpdateController);

function updateController(overrides: Partial<ReturnType<typeof useAppUpdateController>> = {}) {
    return {
        action: jest.fn(async () => undefined),
        actionTitle: 'Check for updates',
        downloadProgress: undefined,
        isBusy: false,
        isSupported: true,
        isUpdateAvailable: false,
        isUpdatePending: false,
        manualPhase: 'idle' as const,
        status: 'Calibrate checks automatically when it opens. You can also check manually.',
        versionInfo: {
            nativeVersion: '0.2.2',
            nativeBuild: '4',
            nativeReleaseTag: 'v0.12.3',
            runtimeVersion: '0.2.2',
            channel: 'internal',
            updateId: null,
            updateLabel: 'Embedded in native build',
            updateCreatedAt: new Date('2026-07-21T20:00:00.000Z'),
            isEmbeddedLaunch: true,
            isEmergencyLaunch: false,
            emergencyLaunchReason: null
        },
        ...overrides
    } as ReturnType<typeof useAppUpdateController>;
}

describe('AboutScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseAuth.mockReturnValue({
            serverUrl: 'https://calibratehealth.app'
        } as ReturnType<typeof useAuth>);
        mockedUseAppUpdateController.mockReturnValue(updateController());
    });

    it('leads with consumer purpose, trust, and accurate launch availability', () => {
        const view = render(<AboutScreen />);

        expect(view.getByText('About Calibrate')).toBeTruthy();
        expect(view.getByText(/compare calories with a personalized target/)).toBeTruthy();
        expect(view.getByText(/Available in English on the web as an installable PWA and on Android/)).toBeTruthy();
        expect(view.queryByText('Service address')).toBeNull();
        expect(view.queryByLabelText('Check for updates')).toBeNull();
        expect(view.getByLabelText('Show advanced details')).toHaveProp(
            'accessibilityState',
            { expanded: false }
        );
    });

    it('uses the canonical product, legal, support, feedback, license, and release destinations', () => {
        render(<AboutScreen />);

        const destinations = mockLink.mock.calls.map(([props]) => props.href);
        expect(destinations).toEqual(expect.arrayContaining([
            CALIBRATE_PRODUCT_LINKS.product,
            CALIBRATE_PRODUCT_LINKS.privacy,
            CALIBRATE_PRODUCT_LINKS.terms,
            CALIBRATE_PRODUCT_LINKS.support,
            CALIBRATE_PRODUCT_LINKS.feedback,
            CALIBRATE_PRODUCT_LINKS.licenses,
            CALIBRATE_PRODUCT_LINKS.releases
        ]));
    });

    it('reveals native diagnostics and a supported update action only after expanding Advanced details', () => {
        const view = render(<AboutScreen />);

        fireEvent.press(view.getByLabelText('Show advanced details'));

        expect(view.getByText('v0.12.3')).toBeTruthy();
        expect(view.getByText('0.2.2 (build 4)')).toBeTruthy();
        expect(view.getAllByText('0.2.2')).toHaveLength(1);
        expect(view.getByText('internal')).toBeTruthy();
        expect(view.getByText('Embedded in native build')).toBeTruthy();
        expect(view.getByText('Calibrate hosted service')).toBeTruthy();
        expect(view.getByText(/can connect to compatible self-hosted services/)).toBeTruthy();
        expect(view.getByText(/operator is responsible for privacy, security, availability, backups, and support/)).toBeTruthy();
        expect(view.getByLabelText('Check for updates')).toBeEnabled();
    });

    it('offers an immediate install action for an available OTA inside Advanced details', () => {
        const action = jest.fn(async () => undefined);
        mockedUseAppUpdateController.mockReturnValue(updateController({
            action,
            actionTitle: 'Install and restart',
            isUpdateAvailable: true,
            manualPhase: 'available',
            status: 'A compatible OTA update is available and ready to download.'
        }));

        const view = render(<AboutScreen />);
        fireEvent.press(view.getByLabelText('Show advanced details'));
        fireEvent.press(view.getByLabelText('Install and restart'));

        expect(action).toHaveBeenCalledTimes(1);
        expect(view.getByText(/compatible OTA update is available/)).toBeTruthy();
    });

    it('does not expose an inert update action on an unsupported runtime', () => {
        mockedUseAppUpdateController.mockReturnValue(updateController({
            actionTitle: 'Release builds only',
            isSupported: false,
            status: 'Manual OTA checks are available in signed release builds.'
        }));

        const view = render(<AboutScreen />);
        fireEvent.press(view.getByLabelText('Show advanced details'));

        expect(view.getByText('Manual OTA checks are available in signed release builds.')).toBeTruthy();
        expect(view.queryByLabelText('Release builds only')).toBeNull();
    });
});
