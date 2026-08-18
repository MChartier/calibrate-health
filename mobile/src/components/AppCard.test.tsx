import { render } from '@testing-library/react-native';
import { AppCard } from './AppCard';
import { spacing } from '../theme';

describe('AppCard', () => {
    it('supports the compact dashboard inset rhythm', () => {
        const screen = render(<AppCard density="compact" testID="card" />);

        expect(screen.getByTestId('card')).toHaveStyle({
            padding: spacing.md,
            paddingTop: spacing.lg,
            gap: spacing.sm
        });
    });
});
