import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DatePickerField } from './DatePickerField';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => {
    const { View } = require('react-native');
    return (props: Record<string, unknown>) => <View {...props} testID="native-date-picker" />;
});

afterEach(() => jest.restoreAllMocks());

function renderDateField(platform: 'ios' | 'android') {
    jest.replaceProperty(Platform, 'OS', platform);
    const onChangeDate = jest.fn();
    const screen = render(
        <DatePickerField
            label="date of birth"
            value="1990-06-15"
            minimumDate="1900-01-01"
            maximumDate="2026-09-05"
            onChangeDate={onChangeDate}
        />
    );
    fireEvent.press(screen.getByRole('button', { name: 'Choose date of birth' }));
    return { screen, onChangeDate };
}

it('confirms an iOS draft only on Done and forwards local date bounds', () => {
    const { screen, onChangeDate } = renderDateField('ios');
    const picker = screen.getByTestId('native-date-picker');
    expect(picker.props.display).toBe('inline');
    expect(picker.props.minimumDate).toEqual(new Date(1900, 0, 1));
    expect(picker.props.maximumDate).toEqual(new Date(2026, 8, 5));

    fireEvent(picker, 'change', { type: 'set' }, new Date(1991, 6, 16));
    expect(onChangeDate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChangeDate).toHaveBeenCalledWith('1991-07-16');
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
});

it('discards a canceled iOS draft and reopens the committed value', () => {
    const { screen, onChangeDate } = renderDateField('ios');
    fireEvent(screen.getByTestId('native-date-picker'), 'change', { type: 'set' }, new Date(1991, 6, 16));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChangeDate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-date-picker')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Choose date of birth' }));
    expect(screen.getByTestId('native-date-picker').props.value).toEqual(new Date(1990, 5, 15));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChangeDate).toHaveBeenCalledWith('1990-06-15');
});

it.each(['set', 'dismissed'])('preserves Android dialog behavior for %s', (type) => {
    const { screen, onChangeDate } = renderDateField('android');
    expect(screen.getByTestId('native-date-picker').props.display).toBe('calendar');
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    fireEvent(screen.getByTestId('native-date-picker'), 'change', { type }, new Date(1991, 6, 16));
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
    if (type === 'set') {
        expect(onChangeDate).toHaveBeenCalledWith('1991-07-16');
    } else {
        expect(onChangeDate).not.toHaveBeenCalled();
    }
});
