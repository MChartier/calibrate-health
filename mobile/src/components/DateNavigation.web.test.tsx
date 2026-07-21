import React from 'react';
import { DateNavigation } from './DateNavigation.web';
import type { LogDateNavigation } from '../hooks/useLogDateNavigation';

type TestInstance = {
    props: Record<string, unknown>;
    findByType: (type: string) => TestInstance;
    findByProps: (props: Record<string, unknown>) => TestInstance;
};

const testRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (
        element: React.ReactElement,
        options?: { createNodeMock: (element: { type: unknown }) => unknown }
    ) => { root: TestInstance };
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../theme', () => ({
    useAppTheme: () => ({
        colors: {
            primary: '#2e7d32',
            onSurface: '#172217',
            onSurfaceVariant: '#526052',
            surfaceContainer: '#eef3eb',
            surfaceContainerLow: '#f5f8f3',
            surfacePressed: '#e2eadf',
            outlineVariant: '#cdd7c9'
        },
        interaction: { minimumTouchTarget: 48 },
        radius: { md: 12 },
        spacing: { xs: 4, sm: 8, md: 16 },
        typography: {
            title: 28,
            screenTitle: 24,
            subtitle: 20,
            body: 16,
            small: 14,
            metric: 34,
            caption: 12
        }
    })
}));

describe('DateNavigation web', () => {
    it('uses a constrained browser date input and forwards date selection', () => {
        const setDate = jest.fn();
        const showPicker = jest.fn();
        const navigation: LogDateNavigation = {
            selectedDate: '2026-07-17',
            selectedDateLabel: 'Jul 17, 2026',
            today: '2026-07-18',
            minDate: '2026-01-01',
            maxDate: '2026-07-18',
            isToday: false,
            canGoBack: true,
            canGoForward: true,
            goToPreviousDate: jest.fn(),
            goToNextDate: jest.fn(),
            goToToday: jest.fn(),
            setDate
        };
        let tree: { root: TestInstance };

        testRenderer.act(() => {
            tree = testRenderer.create(<DateNavigation navigation={navigation} />, {
                createNodeMock: (element) => element.type === 'input'
                    ? { showPicker, focus: jest.fn(), click: jest.fn() }
                    : null
            });
        });

        const input = tree!.root.findByType('input');
        expect(input.props).toMatchObject({
            'aria-label': 'Choose date',
            min: '2026-01-01',
            max: '2026-07-18',
            type: 'date',
            value: '2026-07-17'
        });

        testRenderer.act(() => {
            (input.props.onInput as (event: { currentTarget: { value: string } }) => void)({
                currentTarget: { value: '2026-07-16' }
            });
        });
        expect(setDate).toHaveBeenCalledWith('2026-07-16');

        testRenderer.act(() => {
            (input.props.onClick as () => void)();
        });
        expect(showPicker).toHaveBeenCalledTimes(1);
    });
});
