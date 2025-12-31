import 'dotenv/config';

import bcrypt from 'bcryptjs';
import cors, { type CorsOptions } from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import prisma, { pgPool } from './config/database';
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

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173';

/**
 * Parse a comma-delimited list of origins from CORS_ORIGINS.
 * Defaults to allowing the local Vite dev server origin.
 */
const parseAllowedOrigins = (value: string | undefined): string[] =>
  (value ?? DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
  const inProduction = process.env.NODE_ENV === 'production';

  // Reduce fingerprinting surface; this app is API-only in production.
  app.disable('x-powered-by');

  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  const sessionStore = new PostgresSessionStore(pgPool, SESSION_TTL_MS);
  await sessionStore.initialize();

  const secureCookieEnv = process.env.SESSION_COOKIE_SECURE;
  const useSecureCookies = secureCookieEnv ? secureCookieEnv === 'true' : inProduction;
  const sameSite = parseSameSite(process.env.SESSION_COOKIE_SAMESITE);

  if (useSecureCookies) {
    app.set('trust proxy', 1);
  }

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'development_secret_key',
      resave: false,
      saveUninitialized: false,
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

  apiRouter.use('/goals', goalRoutes);
  apiRouter.use('/metrics', metricRoutes);
  apiRouter.use('/food', foodRoutes);
  apiRouter.use('/my-foods', myFoodsRoutes);
  apiRouter.use('/user', userRoutes);

  // Keep debug/prototype routes (food provider comparisons, etc.) out of production deployments.
  if (!inProduction) {
    apiRouter.use('/dev', devRoutes);
    app.use('/dev/test', devTestRoutes);
  }

  app.get('/', (_req, res) => {
    res.send('Fitness App API');
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

void bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
