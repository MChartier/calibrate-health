import React from 'react';
import { Card, CardContent } from '@mui/material';
import type { CardProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type AppCardProps = Omit<CardProps, 'children'> & {
    children: React.ReactNode;
    /** Optional styles applied to the CardContent wrapper (useful for full-height/scrollable layouts). */
    contentSx?: SxProps<Theme>;
};

/**
 * AppCard
 *
 * Default wrapper for "content tiles" (dashboards, charts, forms, summaries).
 * This centralizes Card vs Paper usage and keeps padding consistent across the app.
 */
const AppCard: React.FC<AppCardProps> = ({ sx, contentSx, children, ...cardProps }) => {
    const mergedCardSx: SxProps<Theme> = [
        { width: '100%' },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    return (
        <Card {...cardProps} sx={mergedCardSx}>
            <CardContent sx={contentSx}>{children}</CardContent>
        </Card>
    );
};

export default AppCard;
