import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import { CompactCardHeader } from './CompactCardHeader';
import { themes } from '../theme';

describe('CompactCardHeader', () => {
    it('keeps the card title compact and metadata inline with an optional action', () => {
        const screen = render(
            <CompactCardHeader
                testID="card-header"
                title="Trend"
                metadata="Current trend: 79.2 kg"
                headingTestID="heading-line"
                action={<View testID="action" />}
            />
        );

        expect(screen.getByRole('header', { name: 'Trend' })).toHaveStyle({
            color: themes.light.colors.onSurface,
            fontSize: themes.light.typography.small,
            fontWeight: '800'
        });
        expect(screen.getByText('Current trend: 79.2 kg')).toBeTruthy();
        expect(screen.getByTestId('heading-line')).toHaveStyle({
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap'
        });
        expect(screen.getByTestId('card-header')).toHaveStyle({ alignItems: 'flex-start' });
        expect(screen.getByTestId('action')).toBeTruthy();
    });
});
