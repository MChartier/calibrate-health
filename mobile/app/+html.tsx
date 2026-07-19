import React, { type PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

/** Web-only document metadata shared by every statically rendered Expo route. */
export default function RootHtml({ children }: PropsWithChildren) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
                <meta name="theme-color" content="#2E7D32" />
                <meta name="color-scheme" content="light dark" />
                <meta
                    name="description"
                    content="Calibrate is a private food, weight, activity, and goal tracker that works with your Calibrate server."
                />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-title" content="calibrate" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <link rel="manifest" href="/manifest.webmanifest" />
                <link rel="icon" href="/calibrate-icon.svg" type="image/svg+xml" />
                <ScrollViewStyleReset />
            </head>
            <body>{children}</body>
        </html>
    );
}
