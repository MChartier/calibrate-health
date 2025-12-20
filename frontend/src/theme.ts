import type { PaletteMode } from '@mui/material';
import { createTheme } from '@mui/material/styles';

const worktreeColor = import.meta.env.VITE_WORKTREE_COLOR?.trim();
const isMainWorktree = import.meta.env.VITE_WORKTREE_IS_MAIN === 'true';
const appBarColor = !isMainWorktree && worktreeColor ? worktreeColor : undefined;
const appBarOverrides = appBarColor
    ? {
          MuiAppBar: {
              styleOverrides: {
                  root: {
                      backgroundColor: appBarColor
                  }
              }
          }
      }
    : {};

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
                main: isDark ? '#90caf9' : '#1976d2'
            },
            secondary: {
                main: isDark ? '#f48fb1' : '#dc004e'
            },
            background: {
                default: isDark ? '#0b1220' : '#f7f8fb',
                paper: isDark ? '#0f172a' : '#ffffff'
            }
        },
        shape: {
            borderRadius: 10
        },
        components: {
            ...appBarOverrides,
            MuiPaper: {
                defaultProps: {
                    elevation: 2
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage: 'none',
                        boxShadow: theme.shadows[3]
                    })
                }
            },
            MuiCard: {
                defaultProps: {
                    elevation: 2
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundImage: 'none',
                        boxShadow: theme.shadows[3]
                    })
                }
            }
        }
    });
}

export default createAppTheme('light');
