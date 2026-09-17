import { BackHandler } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { PageExpansion, type PageExpansionConfig } from './PageExpansion';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../hooks/useReducedMotionPreference', () => ({ useReducedMotionPreference: () => true }));

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
