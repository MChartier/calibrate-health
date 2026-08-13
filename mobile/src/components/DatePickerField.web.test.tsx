import React from 'react';
import { DatePickerField } from './DatePickerField.web';

type TestInstance = {
    props: Record<string, unknown>;
    findByType: (type: string) => TestInstance;
};

const testRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (element: React.ReactElement) => { root: TestInstance };
};

jest.mock('../theme', () => ({
    radius: { md: 12 },
    spacing: { sm: 8, md: 16 },
    useAppTheme: () => ({
        dark: false,
        typography: {
            title: 28,
            screenTitle: 24,
            subtitle: 20,
            body: 16,
            small: 14,
            metric: 34,
            caption: 12,
            styles: {
                page: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
                section: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
                card: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
                body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
                label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
                caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
                metric: { fontSize: 32, lineHeight: 38, fontWeight: '800' }
            }
        },
        colors: {
            outline: '#718071',
            surface: '#ffffff',
            onSurface: '#172217',
            onSurfaceVariant: '#526052'
        }
    })
}));

describe('DatePickerField web', () => {
    it('renders a constrained browser date input and forwards changes', () => {
        const onChangeDate = jest.fn();
        let tree: { root: TestInstance };

        testRenderer.act(() => {
            tree = testRenderer.create(
                <DatePickerField
                    label="Date of birth"
                    maximumDate="2026-07-18"
                    minimumDate="1900-01-01"
                    onChangeDate={onChangeDate}
                    value="1990-01-01"
                />
            );
        });

        const input = tree!.root.findByType('input');
        expect(input.props).toMatchObject({
            'aria-label': 'Date of birth',
            max: '2026-07-18',
            min: '1900-01-01',
            type: 'date',
            value: '1990-01-01'
        });

        testRenderer.act(() => {
            (input.props.onInput as (event: { currentTarget: { value: string } }) => void)({
                currentTarget: { value: '1991-02-03' }
            });
        });
        expect(onChangeDate).toHaveBeenCalledWith('1991-02-03');
    });
});
