import type { ModalProps } from 'react-native';

// Activates two-column content and bounded dialogs for iPad and Android tablet widths.
export const TABLET_LAYOUT_BREAKPOINT = 720;
// Moves primary navigation to a rail when a tablet has enough landscape width.
export const NAVIGATION_RAIL_BREAKPOINT = 1024;

export const SUPPORTED_MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = [
    'portrait',
    'portrait-upside-down',
    'landscape',
    'landscape-left',
    'landscape-right'
];

export function resolveSafeHorizontalPadding(
    basePadding: number,
    leftInset: number,
    rightInset: number,
    insetGap: number
): { paddingLeft: number; paddingRight: number } {
    return {
        paddingLeft: Math.max(basePadding, leftInset + insetGap),
        paddingRight: Math.max(basePadding, rightInset + insetGap)
    };
}
