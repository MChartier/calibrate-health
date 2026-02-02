import 'dotenv/config';

import fs from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import cors, { type CorsOptionsDelegate } from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import prisma, { pgPool } from './config/database';
import { isProductionOrStagingEnv } from './config/environment';
import authRoutes from './routes/auth';
import devRoutes from './routes/dev';
import devTestRoutes from './routes/devTest';
import foodRoutes from './routes/food';
import foodDayRoutes from './routes/foodDays';
import goalRoutes from './routes/goals';
import importRoutes from './routes/imports';
import metricRoutes from './routes/metrics';
import myFoodsRoutes from './routes/myFoods';
import userRoutes from './routes/user';
import { autoLoginTestUser } from './utils/devAuth';
import { DEFAULT_SESSION_TTL_MS, PostgresSessionStore } from './utils/postgresSessionStore';
import { USER_CLIENT_SELECT } from './utils/userSerialization';

const SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;

const DEFAULT_VITE_DEV_SERVER_PORT = 5173; // Fallback port for the Vite dev server when VITE_DEV_SERVER_PORT isn't set.

/**
 * Parse an environment variable as a positive integer.
 */
function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Default CORS allowlist for local development when CORS_ORIGINS is unset.
 *
 * We use the Vite dev server port (VITE_DEV_SERVER_PORT/FRONTEND_PORT) when present so worktrees
 * and devcontainers that customize ports keep working without extra config.
 */
function getDefaultAllowedOriginsDev(env: NodeJS.ProcessEnv = process.env): string[] {
  const port =
    parsePositiveInteger(env.VITE_DEV_SERVER_PORT) ??
    parsePositiveInteger(env.FRONTEND_PORT) ??
    DEFAULT_VITE_DEV_SERVER_PORT;

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

/**
 * Serve the built frontend SPA from disk in deployed environments (NODE_ENV=production|staging).
 *
 * In development we typically run the Vite dev server (HMR) separately and proxy `/api/*` and `/auth/*`
 * to the backend, so serving `dist/` from Express would be redundant and can hide misconfiguration.
 *
 * We only fall back to `index.html` for non-API routes so deep links work without
 * intercepting JSON endpoints like `/api/*` and `/auth/*`.
 */
function configureSpaStaticAssets(app: express.Express, isProductionOrStaging: boolean): void {
  if (!isProductionOrStaging) return;

  const distDir = process.env.FRONTEND_DIST_DIR;
  if (!distDir) {
    console.warn(
      'FRONTEND_DIST_DIR is not set; backend will not serve the built frontend (expected when frontend is hosted separately). Set FRONTEND_DIST_DIR to the Vite dist directory for a single-origin deployment.'
    );
    return;
  }

  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.warn(
      `FRONTEND_DIST_DIR does not contain index.html (${indexHtmlPath}); backend will not serve the built frontend. Ensure the frontend build output is present and FRONTEND_DIST_DIR points to it.`
    );
    return;
  }

  app.use(express.static(distDir));

  // SPA fallback should not hijack backend endpoints.
  const spaFallbackRoute = /^\/(?!api(?:\/|$)|auth(?:\/|$)|dev(?:\/|$)).*/;
  app.get(spaFallbackRoute, (_req, res) => {
    res.sendFile(indexHtmlPath);
  });
}

/**
 * Parse a comma-delimited list of origins from CORS_ORIGINS.
 * Defaults to allowing the local Vite dev server origin in development.
 */
const parseAllowedOrigins = (value: string | undefined, inDeployedEnv: boolean): string[] => {
  if (value && value.trim().length > 0) {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return inDeployedEnv ? [] : getDefaultAllowedOriginsDev();
};

/**
 * Normalize an Origin header or CORS allowlist entry for comparison.
 */
const normalizeOrigin = (origin: string): string | null => {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
};

/**
 * Read an HTTP header as a single string value.
 *
 * Node can surface multi-value headers as `string[]`; for our purposes we only
 * care about the first entry.
 */
function getHeaderValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

type SameSiteSetting = 'lax' | 'none' | 'strict';

/**
 * Map SESSION_COOKIE_SAMESITE to an express-session SameSite value.
 * Defaults to 'lax' because localhost and subdomains remain same-site in typical deployments.
 */
const parseSameSite = (value: string | undefined): SameSiteSetting => {
  if (!value) return 'lax';

  const normalized = value.trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === 'strict') return 'strict';
  return 'lax';
};

/**
 * Resolve the express-session signing secret for cookie/session integrity.
 *
 * In production/staging we fail fast because a missing secret weakens session security and will
 * silently invalidate cookies across deploys. In development we allow a fixed default to keep
 * local setups lightweight.
 */
function resolveSessionSecret(isProductionOrStaging: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (secret) return secret;

  if (isProductionOrStaging) {
    throw new Error('SESSION_SECRET is required in production/staging (set it to a long random string).');
  }

  console.warn(
    'SESSION_SECRET is not set; using development default. Set SESSION_SECRET to keep sessions stable across restarts.'
  );
  return 'development_secret_key';
}

/**
 * Initialize Express middleware (CORS, sessions, Passport) and start the HTTP server.
 */
const bootstrap = async (): Promise<void> => {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProductionOrStaging = isProductionOrStagingEnv(process.env.NODE_ENV);

  // Reduce fingerprinting surface for minimal Express signature.
  app.disable('x-powered-by');

  const secureCookieEnv = process.env.SESSION_COOKIE_SECURE;
  const useSecureCookies = secureCookieEnv ? secureCookieEnv === 'true' : isProductionOrStaging;
  const sameSite = parseSameSite(process.env.SESSION_COOKIE_SAMESITE);
  const sessionSecret = resolveSessionSecret(isProductionOrStaging);

  if (useSecureCookies) {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS, isProductionOrStaging)
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);
  const allowedOriginSet = new Set(allowedOrigins);

  /**
   * Allow requests from:
   * - The same origin as the API host (covers prod + staging deployments where the SPA and API share a domain).
   * - Explicitly configured origins (CORS_ORIGINS), for split frontend/backend deployments.
   */
  const corsDelegate: CorsOptionsDelegate = (req, callback) => {
    const requestOrigin = getHeaderValue(req.headers, 'origin');
    if (!requestOrigin) {
      // Non-browser requests (curl, health checks, etc.).
      callback(null, { origin: false });
      return;
    }

    // For single-origin deployments (typical prod/staging), we do not need CORS at all. If no allowlist is
    // configured, disable CORS headers and let the browser enforce same-origin policy.
    if (allowedOriginSet.size === 0 && isProductionOrStaging) {
      callback(null, { origin: false });
      return;
    }

    const normalizedOrigin = normalizeOrigin(requestOrigin);
    if (!normalizedOrigin) {
      callback(new Error('Not allowed by CORS'));
      return;
    }

    const host = getHeaderValue(req.headers, 'host');
    const forwardedProtocol = getHeaderValue(req.headers, 'x-forwarded-proto');
    const protocol = forwardedProtocol ? forwardedProtocol.split(',')[0].trim() : useSecureCookies ? 'https' : 'http';
    const normalizedRequestOrigin = host ? normalizeOrigin(`${protocol}://${host}`) : null;
    const isSameOrigin = normalizedRequestOrigin !== null && normalizedOrigin === normalizedRequestOrigin;

    if (!isSameOrigin && !allowedOriginSet.has(normalizedOrigin)) {
      callback(new Error('Not allowed by CORS'));
      return;
    }

    callback(null, { origin: true, credentials: true });
  };

  app.use(cors(corsDelegate));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  const sessionStore = new PostgresSessionStore(pgPool, SESSION_TTL_MS);
  await sessionStore.initialize();

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: useSecureCookies,
      name: process.env.SESSION_COOKIE_NAME || 'cal.sid',
      cookie: {
        httpOnly: true,
        secure: useSecureCookies,
        sameSite,
        domain: process.env.SESSION_COOKIE_DOMAIN,
        maxAge: SESSION_TTL_MS,
      },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(autoLoginTestUser);

  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { ...USER_CLIENT_SELECT, password_hash: true },
        });
        if (!user) return done(null, false, { message: 'Incorrect email.' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password.' });
        }

        // Avoid keeping password hashes on req.user or in the session.
        const { password_hash: _passwordHash, ...safeUser } = user;
        return done(null, safeUser);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      // Keep req.user small and non-sensitive; routes can fetch extra columns as needed.
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          weight_unit: true,
          height_unit: true,
          timezone: true,
          date_of_birth: true,
          sex: true,
          height_mm: true,
          activity_level: true,
        },
      });
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.use('/auth', authRoutes);
  const apiRouter = express.Router();
  app.use('/api', apiRouter);

  apiRouter.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  apiRouter.use('/goals', goalRoutes);
  apiRouter.use('/metrics', metricRoutes);
  apiRouter.use('/food', foodRoutes);
  apiRouter.use('/food-days', foodDayRoutes);
  apiRouter.use('/my-foods', myFoodsRoutes);
  apiRouter.use('/imports', importRoutes);
  apiRouter.use('/user', userRoutes);

  // Keep debug/prototype routes (food provider comparisons, etc.) out of production deployments.
  if (!isProductionOrStaging) {
    apiRouter.use('/dev', devRoutes);
    app.use('/dev/test', devTestRoutes);
  }

  configureSpaStaticAssets(app, isProductionOrStaging);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

void bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
