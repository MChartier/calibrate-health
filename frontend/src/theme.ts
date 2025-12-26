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
            button: { textTransform: 'none', fontWeight: 800 }
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
                        boxShadow: theme.palette.mode === 'dark' ? theme.shadows[6] : theme.shadows[3]
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
                        padding: theme.spacing(2),
                        '&:last-child': { paddingBottom: theme.spacing(2) },
                        [theme.breakpoints.down('sm')]: {
                            padding: theme.spacing(1.5),
                            '&:last-child': { paddingBottom: theme.spacing(1.5) }
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
