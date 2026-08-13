import { render } from '@testing-library/react-native';
import { AppButton } from './AppButton';
import { CardHeader } from './CardHeader';
import { themes } from '../theme';

describe('CardHeader', () => {
    it('keeps card typography, metadata alignment, and actions consistent', () => {
        const screen = render(
            <CardHeader
                testID="card-header"
                title="Trend"
                metadata="Current trend: 79.2 kg"
                headingTestID="heading-line"
                action={<AppButton title="Details" variant="ghost" />}
            />
        );

        const heading = screen.getByRole('header', { name: 'Trend' });
        expect(heading.props['aria-level']).toBe(2);
        expect(heading).toHaveStyle({
            color: themes.light.colors.onSurface,
            fontSize: 16,
            lineHeight: 22,
            fontWeight: '700'
        });
        expect(screen.getByText('Current trend: 79.2 kg')).toHaveStyle({
            color: themes.light.colors.onSurfaceVariant,
            fontSize: 12,
            lineHeight: 16
        });
        expect(screen.getByTestId('heading-line')).toHaveStyle({
            flexDirection: 'row',
            alignItems: 'baseline',
            flexWrap: 'wrap'
        });
        expect(screen.getByTestId('card-header')).toHaveStyle({ minHeight: 22 });
        expect(screen.getByRole('button', { name: 'Details' })).toHaveStyle({ minHeight: 48 });
    });

    it('supports comfortable density and explicit heading levels', () => {
        const screen = render(
            <CardHeader density="comfortable" headingLevel={3} testID="card-header" title="Security" />
        );

        expect(screen.getByTestId('card-header')).toHaveStyle({ minHeight: 48 });
        expect(screen.getByRole('header', { name: 'Security' }).props['aria-level']).toBe(3);
    });
});
