import { useWindowDimensions } from 'react-native';

const CONTENT_EXPANSION_START_HEIGHT = 700;
const CONTENT_EXPANSION_END_HEIGHT = 900;
const COMPACT_CONTENT_EXPANSION_LIMIT = 0.35;

export type ResponsiveContentLayout = {
    contentExpansion: number;
    isCompact: boolean;
};

/**
 * Converts viewport height into a 0-1 expansion value. Dividing by font scale
 * preserves room for larger text before asking cards and charts to grow.
 */
export function getContentExpansion(windowHeight: number, fontScale: number): number {
    if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
    const safeFontScale = Number.isFinite(fontScale) ? Math.max(fontScale, 1) : 1;
    const effectiveHeight = windowHeight / safeFontScale;
    const expansionRange = CONTENT_EXPANSION_END_HEIGHT - CONTENT_EXPANSION_START_HEIGHT;
    const expansion = (effectiveHeight - CONTENT_EXPANSION_START_HEIGHT) / expansionRange;
    return Math.max(0, Math.min(expansion, 1));
}

export function interpolateResponsiveValue(minimum: number, maximum: number, expansion: number): number {
    const safeExpansion = Math.max(0, Math.min(expansion, 1));
    return Math.round(minimum + ((maximum - minimum) * safeExpansion));
}

export function useResponsiveContentLayout(): ResponsiveContentLayout {
    const { height, fontScale } = useWindowDimensions();
    const contentExpansion = getContentExpansion(height, fontScale);

    return {
        contentExpansion,
        isCompact: contentExpansion < COMPACT_CONTENT_EXPANSION_LIMIT
    };
}
