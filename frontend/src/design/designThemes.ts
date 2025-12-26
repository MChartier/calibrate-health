import type { PaletteMode } from '@mui/material';
import { alpha, createTheme, darken, lighten } from '@mui/material/styles';
import type { Theme, ThemeOptions } from '@mui/material/styles';

export type DesignStyleId = 'quiet-wellness' | 'athletic-data' | 'citrus-ink';

export const DESIGN_STYLE_LABELS: Record<DesignStyleId, string> = {
    'quiet-wellness': 'Quiet Wellness',
    'athletic-data': 'Athletic Data',
    'citrus-ink': 'Citrus + Ink'
};

type ShadowRampOptions = {
    /** Base RGB color used to tint shadows. */
    shadowColor: string;
    /** Multiplier controlling how quickly shadows get heavier. */
    intensity: number;
};

/**
 * Build a deterministic shadow ramp so each preview theme has a coherent elevation system.
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
 * Create theme options for the "Quiet Wellness" direction: warm neutrals, soft radii, gentle surfaces.
 */
function getQuietWellnessThemeOptions(mode: PaletteMode): ThemeOptions {
    const isDark = mode === 'dark';
    const primary = isDark ? '#7DE1C1' : '#2F6F5E';
    const secondary = isDark ? '#F7C6A3' : '#C0713D';
    const backgroundDefault = isDark ? '#071311' : '#FBFAF7';
    const backgroundPaper = isDark ? '#0B1D18' : '#FFFFFF';

    return {
        palette: {
            mode,
            primary: { main: primary },
            secondary: { main: secondary },
            background: {
                default: backgroundDefault,
                paper: backgroundPaper
            },
            divider: alpha(isDark ? '#FFFFFF' : '#0B1D18', isDark ? 0.14 : 0.08)
        },
        shape: { borderRadius: 18 },
        shadows: buildShadowRamp({ shadowColor: '#000000', intensity: isDark ? 0.75 : 1 }),
        typography: {
            fontFamily:
                '"Avenir Next", Avenir, "Helvetica Neue", Helvetica, sans-serif',
            h1: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700,
                letterSpacing: '-0.02em'
            },
            h2: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700,
                letterSpacing: '-0.015em'
            },
            h3: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700,
                letterSpacing: '-0.01em'
            },
            h4: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700,
                letterSpacing: '-0.01em'
            },
            h5: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700
            },
            h6: {
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
                fontWeight: 700
            },
            button: {
                textTransform: 'none',
                fontWeight: 700
            }
        },
        components: {
            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundColor: alpha(backgroundPaper, isDark ? 0.62 : 0.7),
                        color: isDark ? '#EAF7F1' : '#0B1D18',
                        backdropFilter: 'blur(14px)',
                        borderBottom: `1px solid ${alpha(isDark ? '#FFFFFF' : '#0B1D18', isDark ? 0.14 : 0.08)}`
                    }
                }
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        border: `1px solid ${alpha(isDark ? '#FFFFFF' : '#0B1D18', isDark ? 0.14 : 0.08)}`
                    }
                }
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        border: `1px solid ${alpha(isDark ? '#FFFFFF' : '#0B1D18', isDark ? 0.14 : 0.08)}`
                    }
                }
            },
            MuiButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 999,
                        paddingLeft: theme.spacing(2),
                        paddingRight: theme.spacing(2)
                    }),
                    contained: ({ theme }) => ({
                        backgroundImage: `linear-gradient(135deg, ${lighten(theme.palette.primary.main, 0.05)}, ${darken(
                            theme.palette.primary.main,
                            0.14
                        )})`,
                        boxShadow: theme.shadows[4]
                    })
                }
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04),
                        borderRadius: 14,
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: theme.palette.primary.main,
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.16)}`
                        }
                    }),
                    notchedOutline: ({ theme }) => ({
                        borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.12)
                    })
                }
            },
            MuiBottomNavigation: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        height: 64,
                        borderRadius: 20,
                        border: `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.1)}`,
                        backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.78),
                        backdropFilter: 'blur(14px)',
                        overflow: 'hidden'
                    })
                }
            }
        }
    };
}

/**
 * Create theme options for the "Athletic Data" direction: crisp contrast, instrument-panel surfaces, tabular numbers.
 */
function getAthleticDataThemeOptions(mode: PaletteMode): ThemeOptions {
    const isDark = mode === 'dark';
    const primary = isDark ? '#2DE2E6' : '#0077FF';
    const secondary = isDark ? '#A3FF12' : '#16A34A';
    const backgroundDefault = isDark ? '#070A10' : '#F4F7FF';
    const backgroundPaper = isDark ? '#0B1020' : '#FFFFFF';

    return {
        palette: {
            mode,
            primary: { main: primary },
            secondary: { main: secondary },
            background: {
                default: backgroundDefault,
                paper: backgroundPaper
            },
            divider: alpha(isDark ? '#FFFFFF' : '#0B1020', isDark ? 0.16 : 0.1)
        },
        shape: { borderRadius: 14 },
        shadows: buildShadowRamp({ shadowColor: '#000000', intensity: isDark ? 0.9 : 0.8 }),
        typography: {
            fontFamily: '"DIN Alternate", "Avenir Next", Avenir, sans-serif',
            h1: { fontWeight: 800, letterSpacing: '-0.03em' },
            h2: { fontWeight: 800, letterSpacing: '-0.025em' },
            h3: { fontWeight: 800, letterSpacing: '-0.02em' },
            h4: { fontWeight: 800, letterSpacing: '-0.015em' },
            h5: { fontWeight: 800 },
            h6: { fontWeight: 800 },
            button: {
                textTransform: 'none',
                fontWeight: 800
            }
        },
        components: {
            MuiTypography: {
                styleOverrides: {
                    root: {
                        fontVariantNumeric: 'tabular-nums'
                    }
                }
            },
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        backgroundImage:
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(90deg, ${alpha(primary, 0.16)}, transparent 44%, ${alpha(secondary, 0.12)})`
                                : `linear-gradient(90deg, ${alpha(primary, 0.08)}, transparent 44%, ${alpha(secondary, 0.06)})`
                    })
                }
            },
            MuiPaper: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundImage: 'none',
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: theme.palette.mode === 'dark' ? theme.shadows[6] : theme.shadows[3]
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
                    root: ({ theme }) => ({
                        height: 64,
                        borderRadius: 16,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper
                    })
                }
            },
            MuiBottomNavigationAction: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        minWidth: 0,
                        borderRadius: 12,
                        margin: theme.spacing(0.5),
                        '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                        }
                    })
                }
            }
        }
    };
}

/**
 * Create theme options for the "Citrus + Ink" direction: bold ink surfaces + citrus highlights.
 */
function getCitrusInkThemeOptions(mode: PaletteMode): ThemeOptions {
    const isDark = mode === 'dark';
    const ink = isDark ? '#0B1020' : '#101A33';
    const citrus = '#FFB000';
    const citrusAlt = '#FF6A3D';
    const backgroundDefault = isDark ? '#050814' : '#FFF7E8';
    const backgroundPaper = isDark ? '#0B1020' : '#FFFFFF';

    return {
        palette: {
            mode,
            primary: { main: citrus },
            secondary: { main: ink },
            background: {
                default: backgroundDefault,
                paper: backgroundPaper
            },
            divider: alpha(isDark ? '#FFFFFF' : '#101A33', isDark ? 0.16 : 0.1),
            text: isDark
                ? { primary: '#F6F2E8', secondary: alpha('#F6F2E8', 0.72) }
                : { primary: '#101A33', secondary: alpha('#101A33', 0.7) }
        },
        shape: { borderRadius: 20 },
        shadows: buildShadowRamp({ shadowColor: '#000000', intensity: isDark ? 1 : 0.85 }),
        typography: {
            fontFamily: '"Avenir Next", Avenir, "Helvetica Neue", Helvetica, sans-serif',
            h1: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800, letterSpacing: '-0.03em' },
            h2: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800, letterSpacing: '-0.03em' },
            h3: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800, letterSpacing: '-0.02em' },
            h4: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800, letterSpacing: '-0.015em' },
            h5: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800 },
            h6: { fontFamily: '"Futura", "Avenir Next", sans-serif', fontWeight: 800 },
            button: {
                textTransform: 'none',
                fontWeight: 800
            }
        },
        components: {
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: theme.palette.mode === 'dark' ? alpha(ink, 0.85) : alpha('#FFFFFF', 0.72),
                        color: theme.palette.text.primary,
                        backdropFilter: 'blur(14px)',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        backgroundImage:
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(120deg, ${alpha(citrusAlt, 0.22)}, transparent 46%, ${alpha(citrus, 0.18)})`
                                : `linear-gradient(120deg, ${alpha(citrusAlt, 0.12)}, transparent 46%, ${alpha(citrus, 0.1)})`
                    })
                }
            },
            MuiPaper: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundImage:
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(180deg, ${alpha('#FFFFFF', 0.03)}, transparent 62%)`
                                : 'none',
                        border: `1px solid ${theme.palette.divider}`
                    })
                }
            },
            MuiCard: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage:
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(180deg, ${alpha('#FFFFFF', 0.03)}, transparent 62%)`
                                : 'none'
                    })
                }
            },
            MuiButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 16,
                        transition: 'transform 120ms ease, box-shadow 120ms ease',
                        '&:hover': { transform: 'translateY(-1px)' },
                        '&:active': { transform: 'translateY(0px)' },
                        '&.Mui-focusVisible': {
                            boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.26)}`
                        }
                    }),
                    contained: ({ theme }) => ({
                        backgroundImage: `linear-gradient(135deg, ${citrusAlt}, ${citrus})`,
                        color: theme.palette.mode === 'dark' ? '#0B1020' : '#101A33',
                        boxShadow: theme.shadows[6]
                    }),
                    outlined: ({ theme }) => ({
                        borderColor: alpha(theme.palette.primary.main, 0.6)
                    })
                }
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 16,
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
                    root: ({ theme }) => ({
                        height: 64,
                        borderRadius: 18,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor:
                            theme.palette.mode === 'dark'
                                ? alpha(theme.palette.background.paper, 0.7)
                                : alpha(theme.palette.background.paper, 0.82),
                        backdropFilter: 'blur(14px)',
                        overflow: 'hidden'
                    })
                }
            }
        }
    };
}

/**
 * Create a one-off theme for the Design Lab preview page.
 *
 * This is intentionally separate from `createAppTheme()` so experiments stay isolated until
 * a direction is chosen and merged into the real application theme.
 */
export function createDesignPreviewTheme(style: DesignStyleId, mode: PaletteMode): Theme {
    const options =
        style === 'quiet-wellness'
            ? getQuietWellnessThemeOptions(mode)
            : style === 'athletic-data'
                ? getAthleticDataThemeOptions(mode)
                : getCitrusInkThemeOptions(mode);

    return createTheme(options);
}

