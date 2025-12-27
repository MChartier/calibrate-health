import React from 'react';
import { Paper } from '@mui/material';
import type { PaperProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type AppPanelDensity = 'normal' | 'dense' | 'none';

export type AppPanelProps = PaperProps & {
    /**
     * Controls the default padding applied to the panel.
     * - normal: standard content padding
     * - dense: tighter padding for nested/secondary panels
     * - none: no padding (caller fully controls spacing)
     */
    density?: AppPanelDensity;
    sx?: SxProps<Theme>;
};

/**
 * Resolve padding styles for a structural panel so spacing tweaks are centralized.
 */
function getPanelPadding(density: AppPanelDensity): SxProps<Theme> {
    switch (density) {
        case 'none':
            return { p: 0 };
        case 'dense':
            return (theme) => ({ p: theme.custom.layout.surface.padding.dense });
        case 'normal':
        default:
            return (theme) => ({ p: theme.custom.layout.surface.padding.normal });
    }
}

/**
 * AppPanel
 *
 * Structural surface wrapper (Paper) used for layout/background panels and nested containers.
 * Prefer `AppCard` for primary "content tiles".
 */
const AppPanel: React.FC<AppPanelProps> = ({ density = 'normal', sx, children, ...paperProps }) => {
    const paddingSx = getPanelPadding(density);
    const mergedSx: SxProps<Theme> = [
        // Panels should feel flatter than cards by default.
        { boxShadow: 'none' },
        paddingSx,
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    return (
        <Paper {...paperProps} sx={mergedSx}>
            {children}
        </Paper>
    );
};

export default AppPanel;

