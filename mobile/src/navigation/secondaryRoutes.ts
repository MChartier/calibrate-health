export type SecondaryRouteHeader = {
    title: string;
    backLabel: string;
    fallbackHref: '/(tabs)/today' | '/(tabs)/progress' | '/(tabs)/settings';
    fixedDestination: boolean;
};

export const SECONDARY_ROUTE_HEADERS = {
    'food-log': { title: 'Food log', backLabel: 'Back to Today', fallbackHref: '/(tabs)/today', fixedDestination: true },
    'weight-trend': { title: 'Trend', backLabel: 'Back to Progress', fallbackHref: '/(tabs)/progress', fixedDestination: true },
    activity: { title: 'Activity', backLabel: 'Go back', fallbackHref: '/(tabs)/today', fixedDestination: false },
    'my-foods': { title: 'My Foods', backLabel: 'Back to Account', fallbackHref: '/(tabs)/settings', fixedDestination: false },
    notifications: { title: 'Notifications', backLabel: 'Go back', fallbackHref: '/(tabs)/today', fixedDestination: false },
    about: { title: 'About Calibrate', backLabel: 'Back to Account', fallbackHref: '/(tabs)/settings', fixedDestination: false }
} as const satisfies Record<string, SecondaryRouteHeader>;

export type SecondaryRouteName = keyof typeof SECONDARY_ROUTE_HEADERS;

export function getSecondaryRouteHeader(routeName: string): SecondaryRouteHeader | null {
    if (!(routeName in SECONDARY_ROUTE_HEADERS)) return null;
    return SECONDARY_ROUTE_HEADERS[routeName as SecondaryRouteName];
}
