import type { NextFunction, Request, Response } from 'express';
import prisma from '../config/database';
import { ensureDevTestData } from '../services/devTestData';

const DEFAULT_TEST_USER_EMAIL = 'test@cal.io';

/**
 * Resolve which deterministic dev user should be used for auto-login.
 *
 * This allows scripts (e.g. onboarding flows) to choose between multiple seeded accounts
 * without changing code.
 */
const getAutoLoginTestUserEmail = (): string => {
  const override = process.env.AUTO_LOGIN_TEST_USER_EMAIL;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return DEFAULT_TEST_USER_EMAIL;
};

/**
 * Decide whether the current request should auto-login the local test user.
 */
const shouldAutoLogin = (req: Request): boolean => {
  const enabled = process.env.AUTO_LOGIN_TEST_USER === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  const isLoggingOut = req.path.startsWith('/auth/logout');

  return enabled && !isProduction && !isLoggingOut && !req.isAuthenticated();
};

/**
 * Attach the test user to the session for local development convenience.
 */
export const autoLoginTestUser = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (!shouldAutoLogin(req)) {
    next();
    return;
  }

  try {
    // Make auto-login robust: if the dev DB is fresh, ensure the deterministic
    // user + baseline data exist before attempting to log in.
    await ensureDevTestData();
  } catch (error) {
    console.warn('Dev auto-login: unable to ensure seed data:', error);
  }

  const userEmail = getAutoLoginTestUserEmail();
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    next();
    return;
  }

  req.login(user, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
};
