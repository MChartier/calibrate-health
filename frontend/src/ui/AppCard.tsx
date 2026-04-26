import React from 'react';
import { Card, CardContent } from '@mui/material';
import type { CardProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { mergeSx } from './sx';

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
    return (
        <Card {...cardProps} sx={mergeSx({ width: '100%' }, sx)}>
            <CardContent sx={contentSx}>{children}</CardContent>
        </Card>
    );
};

export default AppCard;
