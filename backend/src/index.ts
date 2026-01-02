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
import { isProductionLikeNodeEnv } from './config/environment';
import authRoutes from './routes/auth';
import devRoutes from './routes/dev';
import devTestRoutes from './routes/devTest';
import foodRoutes from './routes/food';
import goalRoutes from './routes/goals';
import metricRoutes from './routes/metrics';
import myFoodsRoutes from './routes/myFoods';
import userRoutes from './routes/user';
import { autoLoginTestUser } from './utils/devAuth';
import { PostgresSessionStore } from './utils/postgresSessionStore';
import { USER_CLIENT_SELECT } from './utils/userSerialization';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const DEFAULT_ALLOWED_ORIGINS_DEV = 'http://localhost:5173';

/**
 * Serve the built frontend SPA from disk in production-like deployments.
 *
 * We only fall back to `index.html` for non-API routes so deep links work without
 * intercepting JSON endpoints like `/api/*` and `/auth/*`.
 */
function configureSpaStaticAssets(app: express.Express, isProductionLike: boolean): void {
  if (!isProductionLike) return;

  const distDir = process.env.FRONTEND_DIST_DIR;
  if (!distDir) {
    console.warn('FRONTEND_DIST_DIR is not set; skipping SPA static serving.');
    return;
  }

  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.warn(`FRONTEND_DIST_DIR does not contain index.html (${indexHtmlPath}); skipping SPA static serving.`);
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
const parseAllowedOrigins = (value: string | undefined, inProduction: boolean): string[] => {
  if (value && value.trim().length > 0) {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return inProduction ? [] : [DEFAULT_ALLOWED_ORIGINS_DEV];
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
 * Initialize Express middleware (CORS, sessions, Passport) and start the HTTP server.
 */
const bootstrap = async (): Promise<void> => {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProductionLike = isProductionLikeNodeEnv(process.env.NODE_ENV);

  // Reduce fingerprinting surface for minimal Express signature.
  app.disable('x-powered-by');

  const secureCookieEnv = process.env.SESSION_COOKIE_SECURE;
  const useSecureCookies = secureCookieEnv ? secureCookieEnv === 'true' : isProductionLike;
  const sameSite = parseSameSite(process.env.SESSION_COOKIE_SAMESITE);

  if (useSecureCookies) {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS, isProductionLike)
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
    if (allowedOriginSet.size === 0 && isProductionLike) {
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
      secret: process.env.SESSION_SECRET || 'development_secret_key',
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
  apiRouter.use('/my-foods', myFoodsRoutes);
  apiRouter.use('/user', userRoutes);

  // Keep debug/prototype routes (food provider comparisons, etc.) out of production deployments.
  if (!isProductionLike) {
    apiRouter.use('/dev', devRoutes);
    app.use('/dev/test', devTestRoutes);
  }

  configureSpaStaticAssets(app, isProductionLike);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

void bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
