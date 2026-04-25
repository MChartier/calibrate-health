import React from 'react';
import type { Preview } from '@storybook/react-vite';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/i18n/I18nContext.tsx';
import { createAppTheme } from '../src/theme';
import '../src/index.css';
import '../src/App.css';

/**
 * Keep each story isolated from query cache writes triggered by interactive components.
 */
function createStoryQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    });
}

const preview: Preview = {
    globalTypes: {
        paletteMode: {
            description: 'Application palette mode',
            toolbar: {
                title: 'Theme',
                icon: 'mirror',
                items: [
                    { value: 'light', title: 'Light' },
                    { value: 'dark', title: 'Dark' }
                ],
                dynamicTitle: true
            }
        }
    },
    initialGlobals: {
        paletteMode: 'light'
    },
    decorators: [
        (Story, context) => {
            const paletteMode = context.globals.paletteMode === 'dark' ? 'dark' : 'light';
            const theme = createAppTheme(paletteMode);
            const queryClient = createStoryQueryClient();

            return (
                <MemoryRouter>
                    <QueryClientProvider client={queryClient}>
                        <I18nProvider language="en">
                            <ThemeProvider theme={theme}>
                                <CssBaseline enableColorScheme />
                                <Story />
                            </ThemeProvider>
                        </I18nProvider>
                    </QueryClientProvider>
                </MemoryRouter>
            );
        }
    ],
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        },
        layout: 'centered'
    }
};

export default preview;
