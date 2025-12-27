import type { PaletteMode } from '@mui/material';
import { alpha, createTheme, darken } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type {} from '@mui/x-charts/themeAugmentation';

const worktreeColor = import.meta.env.VITE_WORKTREE_COLOR?.trim();
const isMainWorktree = import.meta.env.VITE_WORKTREE_IS_MAIN === 'true';
const appBarColor = !isMainWorktree && worktreeColor ? worktreeColor : undefined;

type ShadowRampOptions = {
    /** Base RGB hex used to tint shadows. */
    shadowColor: string;
    /** Multiplier controlling how quickly shadows get heavier. */
    intensity: number;
};

/**
 * Build a deterministic shadow ramp so the app has a coherent elevation system.
 *
 * MUI expects exactly 25 entries (elevation 0..24).
 */
function buildShadowRamp({ shadowColor, intensity }: ShadowRampOptions): Theme['shadows'] {
    const shadows: string[] = [];
    shadows.push('none');
    for (let i = 1; i < 25; i += 1) {
        const y = Math.round(i * 0.9);
        const blur = Math.round(i * 2.2);
        const spread = Math.round(i * -0.4);
        const a = Math.min(0.32, 0.02 + (i / 24) * 0.18) * intensity;
        shadows.push(`0 ${y}px ${blur}px ${spread}px ${alpha(shadowColor, a)}`);
    }
    return shadows as Theme['shadows'];
}

type PaletteColorName = 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

/**
 * Resolve a palette color to use for "status" components (Alert/Chip) based on the MUI color prop.
 *
 * We treat "default" or undefined as a neutral surface instead of forcing an accent.
 */
function resolveStatusColor(theme: Theme, color: unknown): string {
    const name = typeof color === 'string' ? (color as PaletteColorName) : null;
    if (!name) return theme.palette.text.secondary;
    if (!(name in theme.palette)) return theme.palette.text.secondary;
    return theme.palette[name].main;
}

/**
 * Create the application MUI theme for the given palette mode.
 *
 * Notes:
 * - We keep light/dark theme differences mostly limited to palette/background so MUI components
 *   can do the heavy lifting.
 * - Worktree AppBar overrides (dev) are applied across modes.
 */
export function createAppTheme(mode: PaletteMode) {
    const isDark = mode === 'dark';

    return createTheme({
        palette: {
            mode,
            primary: {
                main: isDark ? '#2DE2E6' : '#0077FF'
            },
            secondary: {
                main: isDark ? '#A3FF12' : '#16A34A'
            },
            background: {
                default: isDark ? '#070A10' : '#F4F7FF',
                paper: isDark ? '#0B1020' : '#FFFFFF'
            },
            divider: alpha(isDark ? '#FFFFFF' : '#0B1020', isDark ? 0.16 : 0.1)
        },
        shape: {
            borderRadius: 14
        },
        shadows: buildShadowRamp({ shadowColor: '#000000', intensity: isDark ? 0.9 : 0.8 }),
        typography: {
            fontFamily: '"DIN Alternate", "Avenir Next", Avenir, "Segoe UI Variable", "Segoe UI", sans-serif',
            h1: { fontWeight: 800, letterSpacing: '-0.03em' },
            h2: { fontWeight: 800, letterSpacing: '-0.025em' },
            h3: { fontWeight: 800, letterSpacing: '-0.02em' },
            h4: { fontWeight: 800, letterSpacing: '-0.015em' },
            h5: { fontWeight: 800 },
            h6: { fontWeight: 800 },
            subtitle2: { fontWeight: 800, letterSpacing: '0.02em' },
            button: { textTransform: 'none', fontWeight: 800 }
        },
        custom: {
            layout: {
                page: {
                    gutterX: { xs: 2, sm: 2, md: 3 },
                    paddingTop: { xs: 2, sm: 3, md: 3 },
                    paddingBottom: { xs: 2, sm: 3, md: 3 },
                    paddingBottomWithBottomNav: 'calc(80px + env(safe-area-inset-bottom))',
                    sectionGap: 2
                },
                surface: {
                    padding: {
                        normal: { xs: 1.5, sm: 2 },
                        dense: { xs: 1.25, sm: 1.5 }
                    }
                }
            },
            icon: {
                size: {
                    nav: 22,
                    action: { small: 20, medium: 22, large: 24 },
                    avatar: 20,
                    fab: 22
                }
            }
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: (theme) => {
                    const accentA = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.1);
                    const accentB = alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08);
                    const bottom = darken(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.18 : 0.05);

                    return {
                        html: {
                            height: '100%'
                        },
                        body: {
                            minHeight: '100vh',
                            fontVariantNumeric: 'tabular-nums',
                            // Digital-feeling "glow" instead of a physical grid/paper texture.
                            backgroundImage: `radial-gradient(1000px 560px at 20% -10%, ${accentA}, transparent 60%),
                                radial-gradient(920px 520px at 110% 0%, ${accentB}, transparent 55%),
                                linear-gradient(180deg, ${theme.palette.background.default}, ${bottom})`
                        },
                        '#root': {
                            minHeight: '100vh'
                        }
                    };
                }
            },
            MuiTypography: {
                styleOverrides: {
                    root: {
                        fontVariantNumeric: 'tabular-nums'
                    }
                }
            },
            MuiInputBase: {
                styleOverrides: {
                    input: {
                        fontVariantNumeric: 'tabular-nums'
                    }
                }
            },
            MuiInputLabel: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        color: theme.palette.text.secondary
                    })
                }
            },
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => {
                        const gradient =
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.16)}, transparent 44%, ${alpha(
                                    theme.palette.secondary.main,
                                    0.12
                                )})`
                                : `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.08)}, transparent 44%, ${alpha(
                                    theme.palette.secondary.main,
                                    0.06
                                )})`;

                        return {
                            backgroundColor: appBarColor ?? theme.palette.background.paper,
                            color: appBarColor ? theme.palette.getContrastText(appBarColor) : theme.palette.text.primary,
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            backgroundImage: appBarColor ? 'none' : gradient
                        };
                    }
                }
            },
            MuiPaper: {
                defaultProps: {
                    elevation: 0
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage: 'none',
                        // Paper is the "structural" surface: keep it flat by default.
                        boxShadow: 'none'
                    })
                }
            },
            MuiCard: {
                defaultProps: {
                    elevation: 0
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage: 'none',
                        boxShadow: theme.palette.mode === 'dark' ? theme.shadows[6] : theme.shadows[3]
                    })
                }
            },
            MuiCardContent: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        padding: theme.spacing(theme.custom.layout.surface.padding.normal.sm),
                        '&:last-child': { paddingBottom: theme.spacing(theme.custom.layout.surface.padding.normal.sm) },
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(theme.custom.layout.surface.padding.normal.xs),
                            '&:last-child': { paddingBottom: theme.spacing(theme.custom.layout.surface.padding.normal.xs) }
                        }
                    })
                }
            },
            MuiDialog: {
                styleOverrides: {
                    paper: ({ theme }) => ({
                        boxShadow: theme.shadows[12],
                        // Give small screens a bit of breathing room without making dialogs feel "mobile framed".
                        margin: theme.spacing(1.5),
                        [theme.breakpoints.up('sm')]: {
                            margin: theme.spacing(2)
                        }
                    })
                }
            },
            MuiDialogTitle: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        padding: theme.spacing(2),
                        fontWeight: 900,
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(1.5)
                        }
                    })
                }
            },
            MuiDialogContent: {
                styleOverrides: {
                    root: ({ theme, ownerState }) => ({
                        padding: theme.spacing(2),
                        ...(ownerState.dividers
                            ? {
                                borderTop: 'none',
                                borderBottom: 'none'
                            }
                            : null),
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(1.5)
                        }
                    })
                }
            },
            MuiDialogActions: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        padding: theme.spacing(1.5, 2, 2),
                        gap: theme.spacing(1),
                        borderTop: `1px solid ${theme.palette.divider}`,
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(1.25, 1.5, 1.5)
                        }
                    })
                }
            },
            MuiAccordion: {
                defaultProps: {
                    disableGutters: true,
                    elevation: 0
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        // Accordions show in stacked lists; keep them crisp and flat.
                        boxShadow: 'none',
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage: 'none',
                        '&:before': { display: 'none' },
                        '&.Mui-expanded': { margin: 0 },
                        '&:first-of-type': {
                            borderTopLeftRadius: theme.shape.borderRadius,
                            borderTopRightRadius: theme.shape.borderRadius
                        },
                        '&:last-of-type': {
                            borderBottomLeftRadius: theme.shape.borderRadius,
                            borderBottomRightRadius: theme.shape.borderRadius
                        }
                    })
                }
            },
            MuiAccordionSummary: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        minHeight: 52,
                        paddingLeft: theme.spacing(2),
                        paddingRight: theme.spacing(2),
                        '&.Mui-expanded': { minHeight: 52 },
                        '&:hover': {
                            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.04)
                        },
                        [theme.breakpoints.down('sm')]: {
                            paddingLeft: theme.spacing(1.5),
                            paddingRight: theme.spacing(1.5)
                        }
                    }),
                    expandIconWrapper: ({ theme }) => ({
                        '& .MuiSvgIcon-root': {
                            fontSize: theme.custom.icon.size.action.medium
                        }
                    }),
                    content: ({ theme }) => ({
                        margin: theme.spacing(1.25, 0),
                        '&.Mui-expanded': { margin: theme.spacing(1.25, 0) }
                    })
                }
            },
            MuiAccordionDetails: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        padding: theme.spacing(2),
                        paddingTop: theme.spacing(0.5),
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(1.5),
                            paddingTop: theme.spacing(0.5)
                        }
                    })
                }
            },
            MuiAlert: {
                styleOverrides: {
                    root: ({ theme, ownerState }) => {
                        const statusColor = resolveStatusColor(theme, ownerState.severity);
                        const isFilled = ownerState.variant === 'filled';
                        return {
                            borderRadius: theme.shape.borderRadius,
                            border: `1px solid ${alpha(statusColor, theme.palette.mode === 'dark' ? 0.42 : 0.32)}`,
                            backgroundColor: alpha(statusColor, isFilled ? 0.22 : theme.palette.mode === 'dark' ? 0.12 : 0.08),
                            color: theme.palette.text.primary
                        };
                    },
                    icon: ({ theme, ownerState }) => ({
                        color: resolveStatusColor(theme, ownerState.severity)
                    }),
                    message: {
                        fontWeight: 600
                    }
                }
            },
            MuiChip: {
                styleOverrides: {
                    root: ({ theme, ownerState }) => {
                        const chipColor = resolveStatusColor(theme, ownerState.color);
                        const isOutlined = ownerState.variant === 'outlined';
                        return {
                            fontWeight: 800,
                            borderRadius: 999,
                            ...(isOutlined
                                ? {
                                    borderColor: alpha(chipColor, theme.palette.mode === 'dark' ? 0.45 : 0.32),
                                    backgroundColor: alpha(chipColor, theme.palette.mode === 'dark' ? 0.12 : 0.08)
                                }
                                : null)
                        };
                    },
                    label: {
                        paddingLeft: 10,
                        paddingRight: 10
                    }
                }
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: ({ theme }) => ({
                        backgroundColor: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: theme.shadows[6],
                        fontWeight: 700,
                        fontSize: theme.typography.pxToRem(12),
                        lineHeight: 1.25,
                        padding: theme.spacing(0.75, 1)
                    }),
                    arrow: ({ theme }) => ({
                        color: theme.palette.background.paper,
                        '&:before': {
                            border: `1px solid ${theme.palette.divider}`
                        }
                    })
                }
            },
            MuiAvatar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiSvgIcon-root': { fontSize: theme.custom.icon.size.avatar }
                    })
                }
            },
            MuiMenu: {
                styleOverrides: {
                    paper: ({ theme }) => ({
                        backgroundImage: 'none',
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: theme.shadows[10]
                    })
                }
            },
            MuiMenuItem: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 10,
                        margin: theme.spacing(0.5),
                        '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                        },
                        '&.Mui-selected:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.26 : 0.16)
                        }
                    })
                }
            },
            MuiLinearProgress: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.1)
                    }),
                    bar: () => ({
                        borderRadius: 999
                    })
                }
            },
            MuiSkeleton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1),
                        '&.MuiSkeleton-rounded': {
                            borderRadius: theme.shape.borderRadius
                        }
                    })
                }
            },
            MuiIconButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 12,
                        transition: 'transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease',
                        '&.MuiIconButton-sizeSmall .MuiSvgIcon-root': {
                            fontSize: theme.custom.icon.size.action.small
                        },
                        '&.MuiIconButton-sizeMedium .MuiSvgIcon-root': {
                            fontSize: theme.custom.icon.size.action.medium
                        },
                        '&.MuiIconButton-sizeLarge .MuiSvgIcon-root': {
                            fontSize: theme.custom.icon.size.action.large
                        },
                        '&:hover': {
                            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06)
                        },
                        '&:active': { transform: 'translateY(1px)' },
                        '&.Mui-focusVisible': {
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.22)}`
                        }
                    })
                }
            },
            MuiListItemButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 12,
                        '&:hover': {
                            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.05)
                        },
                        '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1)
                        },
                        '&.Mui-selected:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.14)
                        },
                        '&.Mui-focusVisible': {
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.18)}`
                        }
                    })
                }
            },
            MuiToggleButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        fontWeight: 800,
                        borderRadius: 12,
                        '&.Mui-selected': {
                            borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.5 : 0.35),
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
                            color: theme.palette.text.primary
                        },
                        '&.Mui-selected:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18)
                        }
                    })
                }
            },
            MuiFab: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 16,
                        boxShadow: theme.shadows[8],
                        transition: 'transform 120ms ease, box-shadow 120ms ease',
                        '& .MuiSvgIcon-root': { fontSize: theme.custom.icon.size.fab },
                        '&:active': { transform: 'translateY(1px)' },
                        '&.Mui-focusVisible': {
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.22)}`
                        }
                    })
                }
            },
            MuiButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 12,
                        transition: 'transform 120ms ease, box-shadow 120ms ease',
                        '&:active': { transform: 'translateY(1px)' },
                        '&.Mui-focusVisible': {
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.22)}`
                        }
                    }),
                    contained: ({ theme }) => ({
                        boxShadow: theme.shadows[5]
                    })
                }
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 12,
                        backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.04 : 0.02),
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: theme.palette.primary.main,
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.18)}`
                        }
                    })
                }
            },
            MuiBottomNavigation: {
                styleOverrides: {
                    root: () => ({
                        height: 64,
                        borderRadius: 0,
                        backgroundColor: 'transparent'
                    })
                }
            },
            MuiBottomNavigationAction: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        minWidth: 0,
                        maxWidth: 'none',
                        position: 'relative',
                        paddingTop: theme.spacing(1),
                        paddingBottom: theme.spacing(1.25),
                        '& .MuiSvgIcon-root': { fontSize: theme.custom.icon.size.nav },
                        '&.Mui-selected': {
                            color: theme.palette.primary.main
                        },
                        '&.Mui-selected .MuiBottomNavigationAction-label': {
                            fontWeight: 800
                        },
                        '&.Mui-selected::after': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: '18%',
                            right: '18%',
                            height: 3,
                            borderRadius: 3,
                            backgroundColor: theme.palette.primary.main
                        }
                    })
                }
            },
            // MUI X-Charts: keep charts crisp and aligned with the "Athletic Data" look.
            MuiChartsAxis: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiChartsAxis-line': {
                            stroke: theme.palette.divider
                        },
                        '& .MuiChartsAxis-tick': {
                            stroke: theme.palette.divider
                        },
                        '& .MuiChartsAxis-tickLabel': {
                            fill: theme.palette.text.secondary,
                            fontWeight: 700
                        },
                        '& .MuiChartsAxis-label': {
                            fill: theme.palette.text.secondary,
                            fontWeight: 700
                        }
                    })
                }
            },
            MuiChartsGrid: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiChartsGrid-line': {
                            stroke: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                            strokeDasharray: '4 6'
                        }
                    })
                }
            },
            MuiChartsTooltip: {
                styleOverrides: {
                    paper: ({ theme }) => ({
                        backgroundColor: theme.palette.background.paper,
                        backgroundImage: 'none',
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: theme.shadows[6]
                    })
                }
            },
            MuiLineElement: {
                styleOverrides: {
                    root: {
                        strokeWidth: 3,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                    }
                }
            },
            MuiMarkElement: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        fill: theme.palette.background.paper,
                        stroke: theme.palette.primary.main,
                        strokeWidth: 2
                    })
                }
            }
        }
    });
}

export default createAppTheme('light');
