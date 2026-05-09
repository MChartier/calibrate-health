import React, { createContext, useContext } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
    APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR,
    APP_PAGE_PADDING_BOTTOM_CSS_VAR,
    APP_PAGE_PADDING_TOP_CSS_VAR,
    APP_TOOLBAR_HEIGHT_CSS_VAR
} from './layoutCssVars';

type AppPageProps = {
    children: React.ReactNode;
    /**
     * Maximum width for the page content.
     * Use a named preset to avoid magic numbers, provide a pixel value for one-offs,
     * or pass `false` for full-width layouts.
     */
    maxWidth?: AppPageMaxWidth | number | false;
    /**
     * When true, remove horizontal gutters on extra-small screens and square surface corners.
     *
     * This is intended for "native-like" mobile layouts where cards are flush to the viewport edge.
     * Only the outermost AppPage applies this rule so nested AppPages can safely set maxWidth.
     */
    fullBleedOnXs?: boolean;
    /** Additional styles applied to the content container (the element that receives `maxWidth`). */
    sx?: SxProps<Theme>;
};

const AppPageNestingContext = createContext(false);

export type AppPageMaxWidth = 'form' | 'content' | 'wide';

const APP_PAGE_MAX_WIDTH: Record<AppPageMaxWidth, number> = {
    form: 420,
    content: 720,
    wide: 960
};

const SAFE_AREA_INSET_BOTTOM = 'var(--safe-area-inset-bottom, 0px)';
type ResponsivePageSpacing = { xs: number; sm: number; md: number };
type ResponsiveCssLength = { xs: string; sm: string; md: string };

/**
 * Resolve AppPage max-width presets into pixel values.
 */
function resolveAppPageMaxWidth(maxWidth: AppPageProps['maxWidth']): number | false {
    if (maxWidth === false) return false;
    if (typeof maxWidth === 'number') return maxWidth;
    if (typeof maxWidth === 'string') return APP_PAGE_MAX_WIDTH[maxWidth];
    return false;
}

/**
 * Convert theme spacing-unit page padding into CSS lengths that can also back layout variables.
 */
function toSpacingLengths(theme: Theme, padding: ResponsivePageSpacing): ResponsiveCssLength {
    return {
        xs: theme.spacing(padding.xs),
        sm: theme.spacing(padding.sm),
        md: theme.spacing(padding.md)
    };
}

/**
 * Add the bottom safe-area inset to responsive spacing tokens.
 */
function addBottomSafeAreaInset(
    theme: Theme,
    paddingBottom: ResponsivePageSpacing
): ResponsiveCssLength {
    return {
        xs: `calc(${theme.spacing(paddingBottom.xs)} + ${SAFE_AREA_INSET_BOTTOM})`,
        sm: `calc(${theme.spacing(paddingBottom.sm)} + ${SAFE_AREA_INSET_BOTTOM})`,
        md: `calc(${theme.spacing(paddingBottom.md)} + ${SAFE_AREA_INSET_BOTTOM})`
    };
}

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
    sx
}) => {
    const isNested = useContext(AppPageNestingContext);
    const resolvedMaxWidth = resolveAppPageMaxWidth(maxWidth);

    const contentSx: SxProps<Theme> = [
        {
            width: '100%',
            ...(resolvedMaxWidth ? { maxWidth: resolvedMaxWidth, mx: 'auto' } : null)
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
                sx={(theme) => {
                    const paddingTop = fullBleedOnXs
                        ? toSpacingLengths(theme, theme.custom.layout.page.paddingTopCompact)
                        : toSpacingLengths(theme, theme.custom.layout.page.paddingTop);
                    const paddingBottom = addBottomSafeAreaInset(theme, theme.custom.layout.page.paddingBottom);

                    return {
                        [APP_PAGE_PADDING_TOP_CSS_VAR]: paddingTop,
                        [APP_PAGE_PADDING_BOTTOM_CSS_VAR]: paddingBottom,
                        [APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR]: `calc(100svh - var(${APP_TOOLBAR_HEIGHT_CSS_VAR}, 0px) - var(${APP_PAGE_PADDING_TOP_CSS_VAR}, 0px) - var(${APP_PAGE_PADDING_BOTTOM_CSS_VAR}, 0px))`,
                        px: fullBleedOnXs ? { ...theme.custom.layout.page.gutterX, xs: 0 } : theme.custom.layout.page.gutterX,
                        pt: `var(${APP_PAGE_PADDING_TOP_CSS_VAR})`,
                        pb: `var(${APP_PAGE_PADDING_BOTTOM_CSS_VAR})`,
                        ...(fullBleedOnXs
                            ? {
                                [theme.breakpoints.down('sm')]: {
                                    '& .MuiPaper-root': { borderRadius: 0 }
                                }
                            }
                            : null)
                    };
                }}
            >
                {content}
            </Box>
        </AppPageNestingContext.Provider>
    );
};

export default AppPage;
