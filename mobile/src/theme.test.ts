import { resolveAppTheme, themes } from './theme';

function channelToLinear(channel: number): number {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
    const channels = hex.match(/[A-Fa-f0-9]{2}/g);
    if (!channels || channels.length !== 3) throw new Error(`Expected an RGB hex color, received ${hex}`);
    const [red, green, blue] = channels.map((channel) => channelToLinear(Number.parseInt(channel, 16)));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

describe('mobile semantic theme', () => {
    it('resolves the system color scheme to a complete light or dark theme', () => {
        expect(resolveAppTheme('light')).toBe(themes.light);
        expect(resolveAppTheme('dark')).toBe(themes.dark);
        expect(resolveAppTheme(null)).toBe(themes.light);
        expect(themes.dark.colors.background).not.toBe(themes.light.colors.background);
        expect(themes.dark.interaction.minimumTouchTarget).toBe(48);
    });

    it('keeps semantic text and status colors contrast-safe in both schemes', () => {
        for (const theme of [themes.light, themes.dark]) {
            expect(contrastRatio(theme.colors.onSurface, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.onSurfaceVariant, theme.colors.surfaceContainer)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.warning, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.onWarningContainer, theme.colors.warningContainer)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.danger, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.onDanger, theme.colors.danger)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(theme.colors.onDangerContainer, theme.colors.dangerContainer)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('uses a saturated red for dark-mode danger states', () => {
        expect(themes.dark.colors.danger).toBe('#FF5F56');
        expect(themes.dark.colors.danger).not.toBe(themes.light.colors.danger);
    });
});
