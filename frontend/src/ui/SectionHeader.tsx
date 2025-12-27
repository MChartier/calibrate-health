import React from 'react';
import { Box, Typography } from '@mui/material';
import type { TypographyProps } from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

type SectionHeaderProps = {
    /** Primary section title. */
    title: React.ReactNode;
    /** Optional supporting line shown under the title. */
    subtitle?: React.ReactNode;
    /** Optional right-aligned actions (buttons/icons/CTAs). */
    actions?: React.ReactNode;
    /** Typography variant used for the title. Defaults to `h6`. */
    titleVariant?: TypographyProps['variant'];
    /**
     * Vertical alignment for the title/actions row when no subtitle is present.
     * Defaults to `baseline` for "title + button" layouts.
     */
    align?: 'baseline' | 'center' | 'flex-start';
    /** Layout overrides. Prefer using a parent Stack spacing when possible. */
    sx?: SxProps<Theme>;
};

/**
 * SectionHeader
 *
 * A standard title + right-side actions row used across cards/surfaces.
 * This reduces drift between pages that implement the same header layout slightly differently.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    subtitle,
    actions,
    titleVariant = 'h6',
    align = 'baseline',
    sx
}) => {
    const alignItems = subtitle ? 'flex-start' : align;

    const mergedSx: SxProps<Theme> = [
        {
            display: 'flex',
            alignItems,
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap'
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    return (
        <Box sx={mergedSx}>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant={titleVariant}>{title}</Typography>
                {subtitle ? (
                    <Typography variant="body2" color="text.secondary">
                        {subtitle}
                    </Typography>
                ) : null}
            </Box>

            {actions ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{actions}</Box> : null}
        </Box>
    );
};

export default SectionHeader;
