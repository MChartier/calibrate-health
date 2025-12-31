/**
 * Determine whether a NODE_ENV value should be treated as production-like.
 *
 * We treat "staging" as production-like so staging deployments behave like production
 * (secure cookies, no dev-only routes, etc.).
 */
export const isProductionLikeNodeEnv = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'production' || nodeEnv === 'staging';

