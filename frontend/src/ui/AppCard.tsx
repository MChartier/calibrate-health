import React from 'react';
import { Card, CardContent } from '@mui/material';
import type { CardProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type AppCardDensity = 'normal' | 'dense' | 'none';

export type AppCardProps = Omit<CardProps, 'children'> & {
    children: React.ReactNode;
    /**
     * Controls the default padding applied to the card content.
     * - normal: uses the theme-level CardContent padding
     * - dense: tighter padding (esp. for mobile)
     * - none: no CardContent wrapper (caller fully controls layout)
     */
    density?: AppCardDensity;
    /** Styles applied to the CardContent wrapper (when `density` is not `none`). */
    contentSx?: SxProps<Theme>;
};

/**
 * Return CardContent styles for a density mode.
 *
 * Normal density is handled by the theme (MuiCardContent override) so we only special-case
 * dense mode here.
 */
function getCardContentSx(density: AppCardDensity): SxProps<Theme> | null {
    if (density !== 'dense') return null;
    return (theme) => ({
        p: theme.custom.layout.surface.padding.dense,
        '&:last-child': { pb: theme.custom.layout.surface.padding.dense }
    });
}

/**
 * AppCard
 *
 * Default wrapper for "content tiles" (dashboards, charts, forms, summaries).
 * This centralizes Card vs Paper usage and keeps padding consistent across the app.
 */
const AppCard: React.FC<AppCardProps> = ({ density = 'normal', sx, contentSx, children, ...cardProps }) => {
    const mergedCardSx: SxProps<Theme> = [
        { width: '100%' },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    if (density === 'none') {
        return (
            <Card {...cardProps} sx={mergedCardSx}>
                {children}
            </Card>
        );
    }

    const mergedContentSx: SxProps<Theme> = [
        ...(getCardContentSx(density) ? [getCardContentSx(density)!] : []),
        ...(Array.isArray(contentSx) ? contentSx : contentSx ? [contentSx] : [])
    ];

    return (
        <Card {...cardProps} sx={mergedCardSx}>
            <CardContent sx={mergedContentSx}>{children}</CardContent>
        </Card>
    );
};

export default AppCard;

