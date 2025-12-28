import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { TransientStatus, TransientStatusTone } from '../hooks/useTransientStatus';

type InlineStatusLineProps = {
    /** Status to render; when null, the line is visually hidden but space is still reserved. */
    status: TransientStatus | null;
    /** Reserved height to prevent layout shifts when status appears/disappears. */
    minHeight?: string | number;
    /** Optional aria-live politeness for assistive tech announcements. */
    ariaLive?: 'polite' | 'assertive' | 'off';
    /** Style overrides for the outer container. */
    sx?: SxProps<Theme>;
};

/**
 * Map a status "tone" to a theme palette color.
 */
function resolveToneColor(tone: TransientStatusTone, theme: Theme): string {
    if (tone === 'success') return theme.palette.success.main;
    if (tone === 'error') return theme.palette.error.main;
    return theme.palette.text.secondary;
}

/**
 * InlineStatusLine
 *
 * Renders a single-line, space-reserved status message (e.g. "Saved") that fades in/out
 * without pushing surrounding UI around.
 */
const InlineStatusLine: React.FC<InlineStatusLineProps> = ({
    status,
    minHeight = '1.25em',
    ariaLive = 'polite',
    sx
}) => {
    const mergedSx: SxProps<Theme> = [
        { minHeight, display: 'flex', alignItems: 'center' },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    return (
        <Box sx={mergedSx} aria-live={ariaLive}>
            <Typography
                variant="caption"
                sx={{
                    display: 'block',
                    width: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'opacity 200ms ease',
                    opacity: status ? 1 : 0,
                    color: (theme) => resolveToneColor(status?.tone ?? 'neutral', theme)
                }}
            >
                {status?.text ?? ''}
            </Typography>
        </Box>
    );
};

export default InlineStatusLine;
