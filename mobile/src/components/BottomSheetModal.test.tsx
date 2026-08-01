import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { BottomSheetModal } from './BottomSheetModal';

jest.mock('../hooks/useReducedMotionPreference', () => ({
    useReducedMotionPreference: () => true
}));

jest.mock('../hooks/useVisualViewportHeight', () => ({
    useVisualViewportHeight: () => 720
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

describe('BottomSheetModal', () => {
    it('anchors the web viewport root while the underlying page is scrolled', () => {
        const screen = render(
            <BottomSheetModal visible onRequestClose={jest.fn()}>
                <Text>Review calorie target</Text>
            </BottomSheetModal>
        );

        expect(StyleSheet.flatten(screen.getByTestId('bottom-sheet-root').props.style)).toMatchObject({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 720
        });
    });
});
