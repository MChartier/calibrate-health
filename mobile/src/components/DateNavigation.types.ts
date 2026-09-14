import type { ViewProps } from 'react-native';
import type { LogDateNavigation } from '../hooks/useLogDateNavigation';

export type DateNavigationProps = ViewProps & {
    navigation: LogDateNavigation;
    compact?: boolean;
    unified?: boolean;
    pickerFooter?: (closePicker: () => void) => React.ReactNode;
};
