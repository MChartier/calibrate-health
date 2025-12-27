import React from 'react';
import { Paper } from '@mui/material';
import type { PaperProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type AppSurfaceDensity = 'normal' | 'dense' | 'none';

export type AppSurfaceProps = PaperProps & {
    /**
     * Controls the default padding applied to the surface.
     * - normal: standard page/card padding
     * - dense: tighter padding for compact sections (esp. mobile)
     * - none: no padding (caller fully controls spacing)
     */
    density?: AppSurfaceDensity;
    /** Shorthand for `PaperProps.sx` (kept explicit so density + overrides compose cleanly). */
    sx?: SxProps<Theme>;
};

/**
 * Resolve padding styles for a surface so spacing tweaks are centralized.
 */
function getSurfacePadding(density: AppSurfaceDensity): SxProps<Theme> {
    switch (density) {
        case 'none':
            return { p: 0 };
        case 'dense':
            return { p: { xs: 1.25, sm: 1.5 } };
        case 'normal':
        default:
            return { p: { xs: 1.5, sm: 2 } };
    }
}

/**
 * AppSurface
 *
 * Our default "card-like" Paper wrapper used for sections that aren't using MUI Card/CardContent.
 * Provides consistent padding and an easy density switch for tighter mobile layouts.
 */
const AppSurface: React.FC<AppSurfaceProps> = ({ density = 'normal', sx, children, ...paperProps }) => {
    const paddingSx = getSurfacePadding(density);
    const mergedSx: SxProps<Theme> = [paddingSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])];

    return (
        <Paper {...paperProps} sx={mergedSx}>
            {children}
        </Paper>
    );
};

export default AppSurface;

