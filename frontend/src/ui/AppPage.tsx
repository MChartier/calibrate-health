import React, { createContext, useContext } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

type AppPageProps = {
    children: React.ReactNode;
    /**
     * Maximum width for the page content in pixels.
     * Use `false` for full-width layouts.
     */
    maxWidth?: number | false;
    /**
     * When true, remove horizontal gutters on extra-small screens and square surface corners.
     *
     * This is intended for "native-like" mobile layouts where cards are flush to the viewport edge.
     * Only the outermost AppPage applies this rule so nested AppPages can safely set maxWidth.
     */
    fullBleedOnXs?: boolean;
    /**
     * When true, reserve bottom space so content doesn't sit under the mobile bottom navigation bar.
     *
     * Only the outermost AppPage applies this rule so nested AppPages can focus on maxWidth.
     */
    reserveBottomNavSpace?: boolean;
    /** Additional styles applied to the content container (the element that receives `maxWidth`). */
    sx?: SxProps<Theme>;
};

const AppPageNestingContext = createContext(false);

/**
 * AppPage
 *
 * A light wrapper around MUI layout primitives that centralizes our:
 * - page gutters (including "full-bleed on xs" behavior)
 * - content max-width patterns
 *
 * It is safe to nest: only the outermost AppPage applies gutters, while nested instances can
 * constrain maxWidth without adding extra padding.
 */
const AppPage: React.FC<AppPageProps> = ({
    children,
    maxWidth = false,
    fullBleedOnXs = false,
    reserveBottomNavSpace = false,
    sx
}) => {
    const isNested = useContext(AppPageNestingContext);

    const contentSx: SxProps<Theme> = [
        {
            width: '100%',
            ...(maxWidth ? { maxWidth, mx: 'auto' } : null)
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    const content = <Box sx={contentSx}>{children}</Box>;

    if (isNested) {
        return content;
    }

    return (
        <AppPageNestingContext.Provider value={true}>
            <Box
                sx={(theme) => ({
                    px: fullBleedOnXs ? { xs: 0, sm: 2, md: 3 } : { xs: 2, sm: 2, md: 3 },
                    pt: { xs: 2, sm: 3, md: 3 },
                    pb: reserveBottomNavSpace
                        ? 'calc(80px + env(safe-area-inset-bottom))'
                        : { xs: 2, sm: 3, md: 3 },
                    ...(fullBleedOnXs
                        ? {
                            [theme.breakpoints.down('sm')]: {
                                '& .MuiPaper-root': { borderRadius: 0 }
                            }
                        }
                        : null)
                })}
            >
                {content}
            </Box>
        </AppPageNestingContext.Provider>
    );
};

export default AppPage;

