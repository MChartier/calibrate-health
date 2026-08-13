import { fireEvent, render } from '@testing-library/react-native';
import { ChoiceGroup } from './ChoiceGroup';

describe('ChoiceGroup', () => {
    const options = [
        { value: 'slow', label: 'Slow', description: 'A gentle pace.' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'fast', label: 'Fast', disabled: true },
        { value: 'maintain', label: 'Maintain' }
    ] as const;

    it('exposes one labeled radio group and checked state', () => {
        const screen = render(
            <ChoiceGroup
                label="Plan pace"
                value="balanced"
                options={options}
                onChange={jest.fn()}
                required
                testID="plan-pace"
            />
        );

        expect(screen.getByTestId('plan-pace-control')).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'Balanced' }).props.accessibilityState).toEqual(
            expect.objectContaining({ checked: true })
        );
        expect(screen.getByRole('radio', { name: 'Fast' }).props.accessibilityState).toEqual(
            expect.objectContaining({ disabled: true })
        );
    });

    it('uses arrow, Home, and End keys with disabled choices skipped', () => {
        const onChange = jest.fn();
        const screen = render(
            <ChoiceGroup label="Plan pace" value="balanced" options={options} onChange={onChange} />
        );

        const balanced = screen.getByRole('radio', { name: 'Balanced' });
        fireEvent(balanced, 'keyDown', { key: 'ArrowDown', preventDefault: jest.fn() });
        expect(onChange).toHaveBeenLastCalledWith('maintain');
        fireEvent(balanced, 'keyDown', { key: 'Home', preventDefault: jest.fn() });
        expect(onChange).toHaveBeenLastCalledWith('slow');
        fireEvent(balanced, 'keyDown', { key: 'End', preventDefault: jest.fn() });
        expect(onChange).toHaveBeenLastCalledWith('maintain');
    });

    it('associates validation text with the group', () => {
        const screen = render(
            <ChoiceGroup
                label="Plan pace"
                options={options}
                onChange={jest.fn()}
                helperText="Choose a sustainable option."
                errorText="Choose a plan pace."
                testID="plan-pace"
            />
        );

        const group = screen.getByTestId('plan-pace-control');
        expect(group.props['aria-invalid']).toBe(true);
        expect(group.props['aria-describedby']).toContain('-error');
        expect(screen.getByRole('alert')).toHaveTextContent('Choose a plan pace.');
    });
});
