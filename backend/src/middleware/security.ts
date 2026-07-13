import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

type AuthRateLimiters = {
  login: RateLimitRequestHandler;
  registration: RateLimitRequestHandler;
  refresh: RateLimitRequestHandler;
  passwordChange: RateLimitRequestHandler;
};

/** Build narrow abuse controls without throttling normal food, weight, or sync traffic. */
export function createAuthRateLimiters(): AuthRateLimiters {
  const createLimiter = (limit: number, message: string): RateLimitRequestHandler =>
    rateLimit({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message }
    });

  return {
    login: createLimiter(20, 'Too many login attempts. Try again later.'),
    registration: createLimiter(10, 'Too many registration attempts. Try again later.'),
    refresh: createLimiter(120, 'Too many token refresh attempts. Try again later.'),
    passwordChange: createLimiter(10, 'Too many password change attempts. Try again later.')
  };
}
