import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useAppUpdateController } from '../updates/useAppUpdateController';
import AboutScreen from '../../app/about';

const mockRouter = {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    replace: jest.fn()
};

jest.mock('expo-router', () => ({
    useRouter: () => mockRouter
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
jest.mock('../updates/useAppUpdateController', () => ({
    useAppUpdateController: jest.fn()
}));

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
        mockedUseAppUpdateController.mockReturnValue(updateController());
    });

    it('shows the native tag, native version, runtime, channel, and embedded update state', () => {
        const view = render(<AboutScreen />);

        expect(view.getByRole('header')).toHaveTextContent('About Calibrate');
        expect(view.getByText('v0.12.3')).toBeTruthy();
        expect(view.getByText('0.2.2 (build 4)')).toBeTruthy();
        expect(view.getAllByText('0.2.2')).toHaveLength(1);
        expect(view.getByText('internal')).toBeTruthy();
        expect(view.getByText('Embedded in native build')).toBeTruthy();
        expect(view.getByLabelText('Check for updates')).toBeEnabled();
    });

    it('offers an immediate install action for an available OTA', () => {
        const action = jest.fn(async () => undefined);
        mockedUseAppUpdateController.mockReturnValue(updateController({
            action,
            actionTitle: 'Install and restart',
            isUpdateAvailable: true,
            manualPhase: 'available',
            status: 'A compatible OTA update is available and ready to download.'
        }));

        const view = render(<AboutScreen />);
        fireEvent.press(view.getByLabelText('Install and restart'));

        expect(action).toHaveBeenCalledTimes(1);
        expect(view.getByText(/compatible OTA update is available/)).toBeTruthy();
    });
});
