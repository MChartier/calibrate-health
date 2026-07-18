import type { ViewProps } from 'react-native';

export type DatePickerFieldProps = ViewProps & {
    label: string;
    value: string;
    onChangeDate: (value: string) => void;
    placeholder?: string;
    helperText?: string;
    minimumDate?: string;
    maximumDate?: string;
    fallbackDate?: string;
};
