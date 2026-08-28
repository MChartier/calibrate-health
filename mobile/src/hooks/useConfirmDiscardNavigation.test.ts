import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useConfirmDiscardNavigation } from './useConfirmDiscardNavigation';

const mockDispatch = jest.fn();
let mockShouldPreventRemove = false;
let mockPreventRemove: ((options: { data: { action: { type: string } } }) => void) | undefined;
const mockConfirmDiscardChanges = jest.fn<Promise<boolean>, []>();

jest.mock('expo-router', () => ({
    useNavigation: () => ({
        dispatch: mockDispatch
    })
}));

jest.mock('expo-router/build/react-navigation/core', () => ({
    usePreventRemove: (
        shouldPrevent: boolean,
        callback: typeof mockPreventRemove
    ) => {
        mockShouldPreventRemove = shouldPrevent;
        mockPreventRemove = callback;
    }
}));

jest.mock('../components/confirmDiscardChanges', () => ({
    confirmDiscardChanges: () => mockConfirmDiscardChanges()
}));

describe('useConfirmDiscardNavigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShouldPreventRemove = false;
        mockPreventRemove = undefined;
    });

    it('confirms before a dirty route is removed and resumes the original action', async () => {
        mockConfirmDiscardChanges.mockResolvedValue(true);
        renderHook(() => useConfirmDiscardNavigation(true));
        const action = { type: 'GO_BACK' };

        act(() => {
            mockPreventRemove?.({ data: { action } });
        });

        expect(mockShouldPreventRemove).toBe(true);
        await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
    });

    it('keeps an explicit navigation request on the page when discard is cancelled', async () => {
        mockConfirmDiscardChanges.mockResolvedValue(false);
        const navigate = jest.fn();
        const { result } = renderHook(() => useConfirmDiscardNavigation(true));

        await act(async () => {
            await result.current.requestNavigation(navigate);
        });

        expect(navigate).not.toHaveBeenCalled();
    });

    it('blocks route removal without prompting while a save is pending', () => {
        renderHook(() => useConfirmDiscardNavigation(false, true));

        act(() => {
            mockPreventRemove?.({ data: { action: { type: 'GO_BACK' } } });
        });

        expect(mockShouldPreventRemove).toBe(true);
        expect(mockConfirmDiscardChanges).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });
});
