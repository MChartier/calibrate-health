import { getContrastRatio } from '@mui/material/styles';

type Rgb = { r: number; g: number; b: number };

type Md3RolePair = {
    /** Role base color (e.g., container). */
    main: string;
    /** Foreground color intended to sit on top of the base color. */
    on: string;
};

export type Md3DerivedPalette = {
    tertiary: string;
    primaryContainer: Md3RolePair;
    secondaryContainer: Md3RolePair;
    tertiaryContainer: Md3RolePair;
    surface: Md3RolePair;
    surfaceVariant: Md3RolePair;
    surfaceContainer: {
        /** Slightly raised surface used for low emphasis groupings. */
        low: string;
        /** Default raised surface tone. */
        base: string;
        /** Higher emphasis raised surface tone. */
        high: string;
        /** Strongest raised surface tone before a full inverse surface. */
        highest: string;
    };
    outline: string;
    outlineVariant: string;
    surfaceTint: string;
    inverseSurface: Md3RolePair;
    inversePrimary: string;
};

type BuildMd3DerivedPaletteOptions = {
    mode: 'light' | 'dark';
    primary: string;
    secondary: string;
    background: string;
    paper: string;
};

// A near-black and near-white that still feel on-brand against tinted surfaces.
const ON_COLOR_DARK = '#F7F9FF';
const ON_COLOR_LIGHT = '#0A1020';

// Ratios tune how aggressively we tint neutral surfaces with the primary color.
const LIGHT_SURFACE_TINT_RATIOS = {
    low: 0.02,
    base: 0.05,
    high: 0.1,
    highest: 0.16
} as const;

const DARK_SURFACE_TINT_RATIOS = {
    low: 0.06,
    base: 0.1,
    high: 0.18,
    highest: 0.28
} as const;

// Outline roles are calmer than full borders, aligning with MD3's "outlineVariant".
const OUTLINE_BLEND_RATIO = 0.32;
const OUTLINE_VARIANT_BLEND_RATIO = 0.2;

/**
 * Blend two hex colors into a new opaque hex color.
 *
 * This gives us MD3-like tonal surfaces without needing a full tonal palette generator.
 */
export function blendHexColors(base: string, mixin: string, mixRatio: number): string {
    const clampedRatio = clamp01(mixRatio);
    const baseRgb = parseHexColor(base);
    const mixinRgb = parseHexColor(mixin);

    const mixed: Rgb = {
        r: baseRgb.r + (mixinRgb.r - baseRgb.r) * clampedRatio,
        g: baseRgb.g + (mixinRgb.g - baseRgb.g) * clampedRatio,
        b: baseRgb.b + (mixinRgb.b - baseRgb.b) * clampedRatio
    };

    return toHexColor(mixed);
}

/**
 * Derive a tertiary color by blending primary and secondary.
 *
 * MD3 expects a tertiary role; this keeps it aligned with our existing brand accents.
 */
export function deriveTertiaryColor(primary: string, secondary: string): string {
    // Lean toward primary so tertiary feels coherent with the core brand color.
    return blendHexColors(primary, secondary, 0.35);
}

/**
 * Build MD3-inspired color roles using our existing brand palette and neutral surfaces.
 */
export function buildMd3DerivedPalette(options: BuildMd3DerivedPaletteOptions): Md3DerivedPalette {
    const { mode, primary, secondary, background, paper } = options;
    const tertiary = deriveTertiaryColor(primary, secondary);

    const surfaceBase = mode === 'dark' ? background : paper;
    const surfaceTintRatios = mode === 'dark' ? DARK_SURFACE_TINT_RATIOS : LIGHT_SURFACE_TINT_RATIOS;

    const surface = toRolePair(surfaceBase);
    const surfaceVariantMain = blendHexColors(surfaceBase, tertiary, mode === 'dark' ? 0.2 : 0.12);
    const surfaceVariant = toRolePair(surfaceVariantMain);

    const surfaceContainer = {
        low: blendHexColors(surfaceBase, primary, surfaceTintRatios.low),
        base: blendHexColors(surfaceBase, primary, surfaceTintRatios.base),
        high: blendHexColors(surfaceBase, primary, surfaceTintRatios.high),
        highest: blendHexColors(surfaceBase, primary, surfaceTintRatios.highest)
    };

    const primaryContainerMain = blendHexColors(surfaceBase, primary, mode === 'dark' ? 0.32 : 0.18);
    const secondaryContainerMain = blendHexColors(surfaceBase, secondary, mode === 'dark' ? 0.34 : 0.2);
    const tertiaryContainerMain = blendHexColors(surfaceBase, tertiary, mode === 'dark' ? 0.36 : 0.22);

    const outline = blendHexColors(surfaceBase, primary, OUTLINE_BLEND_RATIO);
    const outlineVariant = blendHexColors(surfaceBase, primary, OUTLINE_VARIANT_BLEND_RATIO);

    const inverseSurfaceBase = mode === 'dark' ? blendHexColors('#FFFFFF', surfaceBase, 0.12) : '#0F172A';
    const inverseSurface = toRolePair(inverseSurfaceBase);

    const inversePrimary = mode === 'dark' ? blendHexColors(primary, '#FFFFFF', 0.2) : blendHexColors(primary, '#000000', 0.1);

    return {
        tertiary,
        primaryContainer: toRolePair(primaryContainerMain),
        secondaryContainer: toRolePair(secondaryContainerMain),
        tertiaryContainer: toRolePair(tertiaryContainerMain),
        surface,
        surfaceVariant,
        surfaceContainer,
        outline,
        outlineVariant,
        surfaceTint: primary,
        inverseSurface,
        inversePrimary
    };
}

/**
 * Choose a foreground color that meets a minimum contrast against a background.
 */
function pickOnColor(background: string): string {
    const darkContrast = getContrastRatio(background, ON_COLOR_DARK);
    if (darkContrast >= 4.5) return ON_COLOR_DARK;

    const lightContrast = getContrastRatio(background, ON_COLOR_LIGHT);
    return lightContrast >= darkContrast ? ON_COLOR_LIGHT : ON_COLOR_DARK;
}

/**
 * Convert a hex color to a role pair with a contrast-safe foreground.
 */
function toRolePair(main: string): Md3RolePair {
    return { main, on: pickOnColor(main) };
}

/**
 * Parse a hex color string into RGB channels.
 */
function parseHexColor(hex: string): Rgb {
    const normalized = normalizeHex(hex);
    const raw = normalized.slice(1);
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
}

/**
 * Normalize short hex formats (#RGB) to full (#RRGGBB).
 */
function normalizeHex(hex: string): string {
    const trimmed = hex.trim();
    if (!trimmed.startsWith('#')) return `#${trimmed}`;
    if (trimmed.length === 4) {
        const r = trimmed[1];
        const g = trimmed[2];
        const b = trimmed[3];
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed;
}

/**
 * Convert RGB channels back to an opaque hex color.
 */
function toHexColor(rgb: Rgb): string {
    const r = clampChannel(rgb.r).toString(16).padStart(2, '0');
    const g = clampChannel(rgb.g).toString(16).padStart(2, '0');
    const b = clampChannel(rgb.b).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/**
 * Clamp an RGB channel to the valid 0-255 range.
 */
function clampChannel(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * Clamp a ratio into the 0-1 range.
 */
function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
