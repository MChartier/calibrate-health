import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook inherits the app Vite config, but its static build should not emit the PWA service worker.
 */
function isPwaVitePlugin(plugin: unknown): boolean {
    if (!plugin || typeof plugin !== 'object' || !('name' in plugin)) return false;
    const name = String(plugin.name);
    return name.startsWith('vite-plugin-pwa');
}

/**
 * Vite plugins can be nested arrays, so strip PWA entries recursively before Storybook builds.
 */
function removePwaVitePlugins(plugins: unknown[] | undefined): unknown[] | undefined {
    return plugins?.flatMap((plugin) => {
        if (Array.isArray(plugin)) return removePwaVitePlugins(plugin) ?? [];
        return isPwaVitePlugin(plugin) ? [] : [plugin];
    });
}

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    staticDirs: ['../public'],
    viteFinal: (config) => ({
        ...config,
        plugins: removePwaVitePlugins(config.plugins) as typeof config.plugins
    })
};

export default config;
