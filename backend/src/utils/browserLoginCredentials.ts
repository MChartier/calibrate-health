import type { Request } from 'express';
import { isAuthenticatedUser } from '../middleware/authenticatedUser';

/** Server-only proof of a password check; never serialized into a principal or cookie. */
type VerifiedCredential = { userId: number; version: number };
export type BrowserLoginSave = VerifiedCredential & {
  state: 'new' | 'saved' | 'rejected';
  queue: Promise<void>;
};
const verifiedPrincipals = new WeakMap<object, VerifiedCredential>();
const loginSessions = new WeakMap<object, BrowserLoginSave>();

export class BrowserLoginRejected extends Error {
  constructor() { super('Invalid email or password'); }
}

export function markVerifiedBrowserLogin(principal: object, userId: number, version: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(version) || version < 0) {
    throw new BrowserLoginRejected();
  }
  verifiedPrincipals.set(principal, { userId, version });
}

/** Passport calls this after regeneration, immediately before saving the new session. */
function bindVerifiedBrowserSession(principal: object, session: object): void {
  const credential = verifiedPrincipals.get(principal);
  if (!credential) return; // Registration and dev login retain their established behavior.
  verifiedPrincipals.delete(principal);
  loginSessions.set(session, { ...credential, state: 'new', queue: Promise.resolve() });
}

export const browserLoginSave = (session: object): BrowserLoginSave | undefined => loginSessions.get(session);
/** Preserve Passport's integer principal while binding only freshly verified logins. */
export function serializeBrowserLoginUser(req: Request, user: Express.User, done: (error: Error | null, id?: number) => void): void {
  if (!isAuthenticatedUser(user)) return done(new Error('Cannot serialize an invalid user principal'));
  bindVerifiedBrowserSession(user, req.session);
  done(null, user.id);
}
