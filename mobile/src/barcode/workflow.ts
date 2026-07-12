const BARCODE_DUPLICATE_WINDOW_MS = 1_200;
const SUPPORTED_BARCODE_LENGTHS = new Set([6, 7, 8, 12, 13]);
const FATSECRET_URL = 'https://www.fatsecret.com';

export type CameraPermissionState = 'checking' | 'granted' | 'request' | 'settings';

export type BarcodeScanDecision =
    | { kind: 'accepted'; barcode: string }
    | { kind: 'duplicate' }
    | { kind: 'invalid'; message: string };

export type BarcodeLookupStatus = 'idle' | 'searching' | 'result' | 'no-result' | 'error';

export type ProviderAttribution = {
    text: string;
    url?: string;
};

/** Decide whether Android can prompt again or must hand permission control to system settings. */
export function getCameraPermissionState(
    permission: { granted: boolean; canAskAgain: boolean } | null
): CameraPermissionState {
    if (!permission) return 'checking';
    if (permission.granted) return 'granted';
    return permission.canAskAgain ? 'request' : 'settings';
}

/** Normalize only the numeric lengths emitted by the configured EAN/UPC camera scanner. */
export function normalizeBarcode(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) return null;
    return SUPPORTED_BARCODE_LENGTHS.has(normalized.length) ? normalized : null;
}

/**
 * Synchronously locks after an accepted scan so repeated native camera callbacks cannot launch
 * duplicate provider requests before React has committed the next render.
 */
export class BarcodeScanGate {
    private locked = false;
    private lastRawValue: string | null = null;
    private lastEventAt = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly now: () => number = Date.now,
        private readonly duplicateWindowMs = BARCODE_DUPLICATE_WINDOW_MS
    ) {}

    accept(rawValue: unknown): BarcodeScanDecision {
        const comparableValue = typeof rawValue === 'string' ? rawValue.trim() : '';
        const eventAt = this.now();
        if (
            comparableValue.length > 0 &&
            comparableValue === this.lastRawValue &&
            eventAt - this.lastEventAt < this.duplicateWindowMs
        ) {
            return { kind: 'duplicate' };
        }

        this.lastRawValue = comparableValue;
        this.lastEventAt = eventAt;
        if (this.locked) return { kind: 'duplicate' };

        const barcode = normalizeBarcode(rawValue);
        if (!barcode) {
            return {
                kind: 'invalid',
                message: 'That barcode could not be read. Use a clear EAN or UPC barcode and try again.'
            };
        }

        this.locked = true;
        return { kind: 'accepted', barcode };
    }

    reset(): void {
        this.locked = false;
        this.lastRawValue = null;
        this.lastEventAt = Number.NEGATIVE_INFINITY;
    }
}

export function getBarcodeLookupStatus(options: {
    hasBarcode: boolean;
    isPending: boolean;
    isSuccess: boolean;
    hasResult: boolean;
    hasError: boolean;
}): BarcodeLookupStatus {
    if (!options.hasBarcode) return 'idle';
    if (options.isPending) return 'searching';
    if (options.hasError) return 'error';
    if (options.hasResult) return 'result';
    if (options.isSuccess) return 'no-result';
    return 'idle';
}

/** Convert transport/provider failures into actionable copy without exposing raw gateway responses. */
export function getBarcodeLookupErrorMessage(error: unknown): string {
    const status = error && typeof error === 'object' && 'status' in error
        ? (error as { status?: unknown }).status
        : undefined;
    if (typeof status === 'number' && status >= 500) {
        return 'Food providers are unavailable right now. Try the lookup again in a moment.';
    }

    const message = error instanceof Error ? error.message : '';
    if (/network|fetch|timed out|connect|offline/i.test(message)) {
        return 'Could not reach your Calibrate server. Check your connection and try again.';
    }
    return 'Barcode lookup failed. Try again or scan a different barcode.';
}

/** Preserve provider credit, including the required FatSecret attribution text and destination. */
export function getProviderAttribution(provider?: string, attribution?: string): ProviderAttribution | null {
    const normalizedProvider = provider?.trim().toLowerCase();
    if (normalizedProvider === 'fatsecret') {
        return { text: 'Powered by fatsecret', url: FATSECRET_URL };
    }

    const explicitAttribution = attribution?.trim();
    if (explicitAttribution) return { text: explicitAttribution };
    if (!normalizedProvider) return null;

    const providerLabel = normalizedProvider === 'openfoodfacts'
        ? 'Open Food Facts'
        : normalizedProvider === 'usda'
            ? 'USDA FoodData Central'
            : provider!.trim();
    return { text: `Data from ${providerLabel}` };
}
