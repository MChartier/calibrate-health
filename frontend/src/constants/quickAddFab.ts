export const QUICK_ADD_FAB_DIAMETER_SPACING = 7; // Default MUI "large" Fab is 56px (7 * 8).
export const QUICK_ADD_FAB_CONTENT_CLEARANCE_SPACING = 2; // Extra room so bottom-row actions aren't tight against the FAB.
export const QUICK_ADD_FAB_BOTTOM_NAV_GAP_SPACING = 1; // FAB sits 8px above reserved bottom-nav space on mobile.
export const QUICK_ADD_FAB_EDGE_OFFSET_SPACING = 3; // Offset from viewport edges for the floating actions.

export const QUICK_ADD_FAB_PAGE_BOTTOM_PADDING = {
    xs: QUICK_ADD_FAB_DIAMETER_SPACING + QUICK_ADD_FAB_CONTENT_CLEARANCE_SPACING + QUICK_ADD_FAB_BOTTOM_NAV_GAP_SPACING,
    md: QUICK_ADD_FAB_DIAMETER_SPACING + QUICK_ADD_FAB_CONTENT_CLEARANCE_SPACING
} as const;
