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

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#1976d2',
        },
        secondary: {
            main: '#dc004e',
        },
        background: {
            default: '#f7f8fb',
            paper: '#ffffff'
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

export default theme;
