import type { HeightUnit, WeightUnit } from '../context/authContext';

const IMPERIAL_REGION_CODES = new Set(['US', 'LR', 'MM']);

/**
 * Best-effort extraction of a region subtag (e.g. "US") from a BCP 47 locale string.
 *
 * Uses Intl.Locale when available, otherwise falls back to parsing common forms like "en-US" or "en_US".
 */
function getRegionFromLocale(locale: string | null | undefined): string | null {
    if (!locale) return null;
    const trimmed = locale.trim();
    if (!trimmed) return null;

    // Prefer the standards-based parser when the runtime supports it.
    try {
        const maybeLocaleCtor = (Intl as unknown as { Locale?: new (tag: string) => { region?: string } }).Locale;
        if (maybeLocaleCtor) {
            const region = new maybeLocaleCtor(trimmed).region;
            if (typeof region === 'string' && region.trim().length > 0) {
                return region.toUpperCase();
            }
        }
    } catch {
        // Fall through to the best-effort parser.
    }

    const parts = trimmed.replace(/_/g, '-').split('-').filter(Boolean);
    // The region is commonly the second subtag, but can be third if a script is present (e.g. "zh-Hans-CN").
    for (const part of parts.slice(1)) {
        if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
        if (/^[0-9]{3}$/.test(part)) return part;
    }

    return null;
}

/**
 * Choose a reasonable default unit preference from a user's locale string.
 *
 * This is intentionally a simple heuristic: a small set of regions are treated as "imperial leaning",
 * and everything else defaults to metric.
 */
export function getDefaultUnitPreferencesForLocale(
    locale: string | null | undefined
): { weightUnit: WeightUnit; heightUnit: HeightUnit } {
    const region = getRegionFromLocale(locale);
    const prefersImperial = region ? IMPERIAL_REGION_CODES.has(region) : false;

    return prefersImperial ? { weightUnit: 'LB', heightUnit: 'FT_IN' } : { weightUnit: 'KG', heightUnit: 'CM' };
}

/**
 * Default height units when none have been chosen yet. We infer from weight units as a sensible
 * starting point, while still allowing "mixed" combos to be selected explicitly.
 */
export function getDefaultHeightUnitForWeightUnit(weightUnit: WeightUnit): HeightUnit {
    return weightUnit === 'LB' ? 'FT_IN' : 'CM';
}
