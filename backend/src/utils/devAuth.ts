import type { NextFunction, Request, Response } from 'express';
import prisma from '../config/database';
import { ensureDevTestData } from '../services/devTestData';

const TEST_USER_EMAIL = 'test@calibratehealth.app';

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

  const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
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
