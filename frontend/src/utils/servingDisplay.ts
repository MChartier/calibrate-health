const NON_PLURALIZABLE_UNITS = new Set(
    [
        'g',
        'kg',
        'mg',
        'ml',
        'l',
        'oz',
        'fl oz',
        'lb',
        'kcal',
        'cal'
    ].map((unit) => unit.toLowerCase())
);

const LIKELY_PLURAL_SINGULAR_EXCEPTIONS = new Set(['bus']);

/**
 * Format a decimal-friendly quantity for UI labels without unnecessary trailing zeros.
 */
function formatQuantity(value: number): string {
    if (!Number.isFinite(value)) return '';

    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    return formatter.format(value);
}

/**
 * Pluralize a free-form unit label using a lightweight English heuristic.
 *
 * This intentionally avoids "smart" localization and only handles the most common cases.
 */
export function pluralizeUnitLabel(unitLabel: string, amount: number): string {
    const trimmed = unitLabel.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';

    if (!Number.isFinite(amount) || Math.abs(amount - 1) < 1e-9) {
        return trimmed;
    }

    const normalized = trimmed.toLowerCase();
    if (NON_PLURALIZABLE_UNITS.has(normalized)) {
        return trimmed;
    }

    // Avoid guessing for structured labels ("per 100g", "x/y", etc.).
    if (/[0-9/()]/.test(trimmed)) {
        return trimmed;
    }

    const parts = trimmed.split(' ');
    const last = parts[parts.length - 1] ?? trimmed;
    const lastLower = last.toLowerCase();

    // If it already looks plural (ends with "s"), keep it as-is to avoid "sliceses".
    const looksAlreadyPlural =
        lastLower.endsWith('s') && !lastLower.endsWith('ss') && !LIKELY_PLURAL_SINGULAR_EXCEPTIONS.has(lastLower);
    if (looksAlreadyPlural) {
        return trimmed;
    }

    let pluralLast = last;
    if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(last)) {
        pluralLast = last.slice(0, -1) + 'ies';
    } else if (/(s|x|z|ch|sh)$/i.test(last)) {
        pluralLast = last + 'es';
    } else {
        pluralLast = last + 's';
    }

    return [...parts.slice(0, -1), pluralLast].join(' ');
}

/**
 * Format a log entry's servings snapshot into a short display label (e.g. "2 slices" or "2 x 30 g").
 *
 * Returns null when inputs are missing or invalid so callers can hide the label.
 */
export function formatServingSnapshotLabel(args: {
    servingsConsumed?: number | null;
    servingSizeQuantity?: number | null;
    servingUnitLabel?: string | null;
}): string | null {
    const servings = args.servingsConsumed;
    const unitLabel = typeof args.servingUnitLabel === 'string' ? args.servingUnitLabel.trim() : '';
    const servingSizeQuantity = args.servingSizeQuantity;

    if (servings === null || servings === undefined) return null;
    if (!Number.isFinite(servings) || servings <= 0) return null;
    if (!unitLabel) return null;

    const servingsText = formatQuantity(servings);

    if (servingSizeQuantity === null || servingSizeQuantity === undefined) {
        return `${servingsText} ${pluralizeUnitLabel(unitLabel, servings)}`;
    }

    if (!Number.isFinite(servingSizeQuantity) || servingSizeQuantity <= 0) {
        return `${servingsText} ${pluralizeUnitLabel(unitLabel, servings)}`;
    }

    if (Math.abs(servingSizeQuantity - 1) < 1e-9) {
        return `${servingsText} ${pluralizeUnitLabel(unitLabel, servings)}`;
    }

    return `${servingsText} x ${formatQuantity(servingSizeQuantity)} ${pluralizeUnitLabel(unitLabel, servings)}`;
}

