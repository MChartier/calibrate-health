import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#0f766e',
    },
    secondary: {
      main: '#f59e0b',
    },
    background: {
      default: '#f5f5f4',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
  },
});
