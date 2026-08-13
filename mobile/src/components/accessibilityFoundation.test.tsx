import { render } from '@testing-library/react-native';
import Svg from 'react-native-svg';
import { CalibrateLogo } from './CalibrateLogo';
import { ProgressBar } from './ProgressBar';
import { WEB_ACCESSIBILITY_STYLES } from '../accessibility/webAccessibilityStyles';

describe('shared accessibility foundation', () => {
    it('keeps the brand mark decorative by default with an accessible opt-in', () => {
        const decorative = render(<CalibrateLogo />);
        const decorativeSvg = decorative.UNSAFE_getByType(Svg);
        expect(decorativeSvg.props).toEqual(expect.objectContaining({
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants',
            'aria-hidden': true
        }));

        const named = render(<CalibrateLogo accessibilityLabel="Calibrate" />);
        expect(named.getByRole('image', { name: 'Calibrate' })).toBeTruthy();
    });

    it('exposes one named progressbar and hides its visual fill', () => {
        const screen = render(<ProgressBar accessibilityLabel="Goal progress" value={0.42} />);
        const progress = screen.getByRole('progressbar', { name: 'Goal progress' });
        expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
        const fill = progress.children[0];
        if (typeof fill === 'string') throw new Error('Expected the progress fill view.');
        expect(fill.props).toEqual(expect.objectContaining({
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants',
            'aria-hidden': true
        }));
    });

    it('defines system-color fallbacks for focus, selection, and progress', () => {
        expect(WEB_ACCESSIBILITY_STYLES).toContain('@media (forced-colors: active)');
        expect(WEB_ACCESSIBILITY_STYLES).toContain(':focus-visible');
        expect(WEB_ACCESSIBILITY_STYLES).toContain('[role="radio"][aria-checked="true"]');
        expect(WEB_ACCESSIBILITY_STYLES).toContain('[role="progressbar"]');
        expect(WEB_ACCESSIBILITY_STYLES).toContain('[role="progressbar"] > [aria-hidden="true"]');
        expect(WEB_ACCESSIBILITY_STYLES).toContain('Highlight');
        expect(WEB_ACCESSIBILITY_STYLES).toContain('CanvasText');
    });
});
