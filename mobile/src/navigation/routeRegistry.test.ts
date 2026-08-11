/**
 * Exercises route registry behavior and regression boundaries.
 */
import {
  REGISTERED_ROUTE_PATHS,
  ROUTE_IDS,
  ROUTE_REGISTRY,
  canonicalPathForRoute,
  getRouteByPath,
  getRouteFallback,
  getRouteParent,
  type RouteId,
} from './routeRegistry';

describe('route registry', () => {
  it('is exhaustive and has one owner for every canonical and alias path', () => {
    expect(Object.keys(ROUTE_REGISTRY)).toEqual(ROUTE_IDS);
    expect(new Set(REGISTERED_ROUTE_PATHS).size).toBe(REGISTERED_ROUTE_PATHS.length);

    for (const path of REGISTERED_ROUTE_PATHS) {
      expect(path).toMatch(/^\/(?:[^/].*)?$/);
      if (path !== '/') expect(path.endsWith('/')).toBe(false);
      expect(getRouteByPath(path)).not.toBeNull();
    }
  });

  it('declares valid hierarchy, fallback, title, and shell metadata', () => {
    for (const routeId of ROUTE_IDS) {
      const definition = ROUTE_REGISTRY[routeId];
      expect(definition.title.trim()).not.toBe('');
      expect(definition.documentTitle.trim()).not.toBe('');

      if (definition.parent) {
        expect(ROUTE_IDS).toContain(definition.parent);
        expect(getRouteParent(routeId)).toBe(ROUTE_REGISTRY[definition.parent]);
      } else {
        expect(getRouteParent(routeId)).toBeNull();
      }

      if (definition.fallback) {
        expect(ROUTE_IDS).toContain(definition.fallback);
        expect(getRouteFallback(routeId)).toBe(ROUTE_REGISTRY[definition.fallback]);
        expect(definition.backLabel).not.toBeNull();
      } else {
        expect(getRouteFallback(routeId)).toBeNull();
      }

      if (definition.shellPolicy === 'app') {
        expect(definition.authClass).toBe('authenticated');
      }
    }
  });

  it('keeps the launch hierarchy and parent fallbacks explicit', () => {
    const expectedParents = {
      'food-log': 'today',
      'weight-trend': 'progress',
      activity: 'settings',
      'my-foods': 'settings',
      about: 'settings',
      advanced: 'settings',
      notifications: 'today',
      weight: 'progress',
      barcode: 'today',
    } as const satisfies Partial<Record<RouteId, RouteId>>;

    for (const [routeId, parent] of Object.entries(expectedParents)) {
      const definition = ROUTE_REGISTRY[routeId as RouteId];
      expect(definition.parent).toBe(parent);
      expect(definition.fallback).toBe(parent);
    }
  });

  it('uses the same Saved foods label as its Settings navigation action', () => {
    expect(ROUTE_REGISTRY['my-foods'].title).toBe('Saved foods');
    expect(ROUTE_REGISTRY['my-foods'].documentTitle).toBe('Saved foods - Calibrate');
  });
  it('lets authenticated users reach onboarding so runtime completion state decides the redirect', () => {
    expect(ROUTE_REGISTRY.onboarding.authenticatedRedirect).toBeNull();
  });
  it('preserves the exported production root document title', () => {
    expect(ROUTE_REGISTRY.root.documentTitle).toBe('calibrate');
  });
  it('resolves canonical paths and redirect aliases without route-name guessing', () => {
    expect(canonicalPathForRoute('weight-trend')).toBe('/weight-trend');
    expect(getRouteByPath('/weight-trend/?range=month')).toMatchObject({
      routeId: 'weight-trend',
      canonicalPath: '/weight-trend',
      matchedPath: '/weight-trend',
      isAlias: false,
    });
    expect(getRouteByPath('/log')).toMatchObject({
      routeId: 'today',
      canonicalPath: '/today',
      matchedPath: '/log',
      isAlias: true,
    });
    expect(getRouteByPath('/goals')).toMatchObject({
      routeId: 'progress',
      canonicalPath: '/progress',
      matchedPath: '/goals',
      isAlias: true,
    });
    expect(getRouteByPath('/not-registered')).toBeNull();
  });
});
