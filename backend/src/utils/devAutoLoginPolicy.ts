import type { Request } from 'express';

import { isProductionLikeNodeEnv } from '../config/environment';

export type AutoLoginRequestLike = Pick<Request, 'path' | 'isAuthenticated'>;

/**
 * Decide whether the current request should auto-login the local test user.
 *
 * We keep this logic separate from the Prisma-dependent middleware so it can be unit tested
 * without requiring DATABASE_URL.
 */
export function shouldAutoLoginTestUser(
  req: AutoLoginRequestLike,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const enabled = env.AUTO_LOGIN_TEST_USER === 'true';
  const isProductionLike = isProductionLikeNodeEnv(env.NODE_ENV);
  const isLoggingOut = req.path.startsWith('/auth/logout');
  return enabled && !isProductionLike && !isLoggingOut && !req.isAuthenticated();
}
