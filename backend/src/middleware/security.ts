import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

type AuthRateLimiters = {
  login: RateLimitRequestHandler;
  registration: RateLimitRequestHandler;
  refresh: RateLimitRequestHandler;
  passwordChange: RateLimitRequestHandler;
  pairingIssueIp: RateLimitRequestHandler;
  pairingIssue: RateLimitRequestHandler;
  pairingExchange: RateLimitRequestHandler;
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
    passwordChange: createLimiter(10, 'Too many password change attempts. Try again later.'),
    pairingIssueIp: createLimiter(60, 'Too many Wear pairing requests from this network. Try again later.'),
    pairingIssue: rateLimit({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many Wear pairing requests. Try again later.' },
      // This limiter runs after bearer auth. Invalid/anonymous traffic is rejected elsewhere and
      // must not consume an authenticated phone session's pairing budget.
      skip: (_req, res) => typeof res.locals.mobileAuthSessionId !== 'number',
      keyGenerator: (_req, res) => `mobile-session:${res.locals.mobileAuthSessionId}`
    }),
    pairingExchange: createLimiter(30, 'Too many Wear pairing attempts. Try again later.')
  };
}
