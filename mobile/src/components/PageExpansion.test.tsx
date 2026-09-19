import React from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ExpansionRegion, PageExpansion, type PageExpansionConfig } from './PageExpansion';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
let mockReducedMotion = true;
jest.mock('../hooks/useReducedMotionPreference', () => ({ useReducedMotionPreference: () => mockReducedMotion }));

describe('native expansion Back handling', () => {
    afterEach(() => jest.restoreAllMocks());

    it('consumes Back only for the expanded active page and releases it on collapse', () => {
        const remove = jest.fn();
        let onBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
        const listen = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
            onBack = listener;
            return { remove };
        });
        const onClose = jest.fn();
        const config: PageExpansionConfig = { id: null, title: 'Food log', onClose, onRestore: jest.fn(), renderContent: () => null };
        const page = (value: PageExpansionConfig) => <PageExpansion config={value} columnStyle={undefined}>{() => null}</PageExpansion>;
        const view = render(page(config));
        expect(listen).not.toHaveBeenCalled();
        view.rerender(page({ ...config, id: 'food', focused: false }));
        expect(listen).not.toHaveBeenCalled();
        view.rerender(page({ ...config, id: 'food', focused: true }));
        expect(listen).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
        act(() => expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true));
        expect(onClose).toHaveBeenCalledTimes(1);
        view.rerender(page(config));
        expect(remove).toHaveBeenCalledTimes(1);
    });
});

it('shrinks the native pane through intermediate bounds before returning to the overview', () => {
    jest.useFakeTimers();
    mockReducedMotion = false;
    let sourceY = 200;
    const measure = jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: View, callback) {
        const isSource = this.props.testID === 'trend-source';
        callback(0, isSource ? sourceY : 0, 412, isSource ? 260 : 680);
    });
    function Example() {
        const [id, setId] = React.useState<string | null>(null);
        return <PageExpansion columnStyle={undefined} config={{
            id, title: 'Trend', onClose: () => setId(null), onRestore: setId,
            focused: false, renderContent: () => <View testID="trend-detail" />
        }}>{() => <ExpansionRegion id="trend" order={2} testID="trend-source">
            <Pressable accessibilityLabel="Expand Trend" onPress={() => setId('trend')} />
        </ExpansionRegion>}</PageExpansion>;
    }
    const screen = render(<Example />);
    try {
        fireEvent.press(screen.getByLabelText('Expand Trend'));
        act(() => jest.advanceTimersByTime(450));
        expect(screen.getByTestId('expanded-trend')).toHaveStyle({ top: 0, height: 680 });
        sourceY = 0; // Native measurement includes the expanded source's translation.
        fireEvent.press(screen.getByLabelText('Collapse Trend'));
        act(() => jest.advanceTimersByTime(180));
        const middle = StyleSheet.flatten(screen.getByTestId('expanded-trend').props.style);
        expect(middle.top).toBeGreaterThan(0);
        expect(middle.top).toBeLessThan(200);
        expect(middle.height).toBeGreaterThan(260);
        expect(middle.height).toBeLessThan(680);
        expect(screen.getByTestId('trend-detail')).toBeTruthy();
        act(() => jest.advanceTimersByTime(250));
        expect(screen.queryByTestId('expanded-trend')).toBeNull();
        expect(screen.getByLabelText('Expand Trend')).toBeTruthy();
    } finally {
        screen.unmount();
        measure.mockRestore();
        jest.useRealTimers();
        mockReducedMotion = true;
    }
});
