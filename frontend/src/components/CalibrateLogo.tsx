import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

const LOGO_VIEW_BOX = '0 0 64 64';
const LOGO_GAUGE_STROKE_WIDTH = 9; // Controls the weight of the dial ring in the brand mark.
const LOGO_NOTCH_STROKE_WIDTH = 6; // Keeps the top reference notch readable at small app-bar sizes.
const LOGO_NEEDLE_STROKE_WIDTH = 7; // Controls the visual weight of the green gauge needle.

export type CalibrateLogoProps = {
    showWordmark?: boolean;
    size?: number;
    sx?: SxProps<Theme>;
};

/**
 * Inline Calibrate mark based on the slate dial + green needle brand direction.
 */
const CalibrateLogo: React.FC<CalibrateLogoProps> = ({ showWordmark = true, size = 36, sx }) => {
    const needleGradientId = React.useId().replace(/:/g, '');

    return (
        <Box sx={[{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}>
            {size > 0 && (
                <Box
                    component="svg"
                    viewBox={LOGO_VIEW_BOX}
                    role="img"
                    aria-label={showWordmark ? undefined : 'calibrate'}
                    sx={{
                        width: size,
                        height: size,
                        display: 'block',
                        flexShrink: 0,
                        color: 'text.primary',
                        overflow: 'visible'
                    }}
                >
                    <defs>
                        <linearGradient id={needleGradientId} x1="20" y1="48" x2="50" y2="18" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#2E7D32" />
                            <stop offset="1" stopColor="#A3E635" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M48.5 14.5A24 24 0 1 0 50 49"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={LOGO_GAUGE_STROKE_WIDTH}
                        strokeLinecap="butt"
                    />
                    <path
                        d="M32 4.5V14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={LOGO_NOTCH_STROKE_WIDTH}
                        strokeLinecap="round"
                    />
                    <path
                        d="M30.5 36.5L48.5 18.5"
                        fill="none"
                        stroke={`url(#${needleGradientId})`}
                        strokeWidth={LOGO_NEEDLE_STROKE_WIDTH}
                        strokeLinecap="round"
                    />
                    <circle cx="29" cy="38" r="8.5" fill="#2E7D32" />
                    <circle cx="29" cy="38" r="3.8" fill="#FFFFFF" />
                </Box>
            )}

            {showWordmark && (
                <Typography
                    component="span"
                    sx={{
                        color: 'text.primary',
                        fontWeight: 900,
                        fontSize: { xs: '1.125rem', sm: '1.35rem' },
                        lineHeight: 1,
                        whiteSpace: 'nowrap'
                    }}
                >
                    calibrate
                </Typography>
            )}
        </Box>
    );
};

export default CalibrateLogo;
