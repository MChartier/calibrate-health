import type { NextFunction, Request, Response } from 'express';
import { authenticateMobileAccessToken } from '../services/mobileAuth';

/**
 * Authenticate native bearer tokens before route-level `req.isAuthenticated()` guards run.
 *
 * Existing browser sessions continue through Passport unchanged; native requests get a hydrated
 * `req.user` and a request-local authenticated predicate.
 */
export const authenticateMobileBearerToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.get('authorization');
  if (!authorization) {
    return next();
  }

  const result = await authenticateMobileAccessToken(authorization);
  if (!result.ok) {
    // Logout can revoke by refresh token even after the short-lived bearer token expires.
    if (req.method === 'POST' && req.path === '/auth/mobile/logout') {
      return next();
    }
    return res.status(result.status).json({ message: result.message });
  }

  req.user = result.user;
  req.isAuthenticated = (() => true) as Request['isAuthenticated'];
  return next();
};
