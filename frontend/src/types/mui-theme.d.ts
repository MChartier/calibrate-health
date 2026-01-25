declare module '@mui/material/styles' {
    interface Theme {
        /**
         * App-specific design tokens that sit "above" raw spacing numbers.
         *
         * Keeping these on the theme makes spacing decisions explicit and lets both wrappers and
         * component overrides consume the same values.
         */
        custom: {
            layout: {
                page: {
                    /** Horizontal page gutters (in theme spacing units). */
                    gutterX: { xs: number; sm: number; md: number };
                    /** Top padding for page content (in theme spacing units). */
                    paddingTop: { xs: number; sm: number; md: number };
                    /** Top padding for page content on compact (mobile) layouts (in theme spacing units). */
                    paddingTopCompact: { xs: number; sm: number; md: number };
                    /** Bottom padding for page content when no bottom nav is present (in theme spacing units). */
                    paddingBottom: { xs: number; sm: number; md: number };
                    /**
                     * Bottom padding used when reserving space for the mobile bottom navigation.
                     * Uses CSS `calc()` so we can include the platform safe-area inset.
                     */
                    paddingBottomWithBottomNav: string;
                    /** Default vertical spacing between page sections (in theme spacing units). */
                    sectionGap: number;
                    /** Tighter vertical spacing between page sections on small screens (in theme spacing units). */
                    sectionGapCompact: number;
                };
                surface: {
                    padding: {
                        /** Default surface padding (in theme spacing units). */
                        normal: { xs: number; sm: number };
                        /** Dense surface padding (in theme spacing units). */
                        dense: { xs: number; sm: number };
                    };
                };
            };
            icon: {
                size: {
                    /** Icon size used for primary navigation (drawer + bottom nav). */
                    nav: number;
                    /** Icon sizes used for IconButton actions. */
                    action: { small: number; medium: number; large: number };
                    /** Icon size used when rendering icons inside compact Avatars. */
                    avatar: number;
                    /** Icon size used inside Fabs (SpeedDial). */
                    fab: number;
                };
            };
        };
    }

    interface ThemeOptions {
        custom?: Theme['custom'];
    }
}

export {};
