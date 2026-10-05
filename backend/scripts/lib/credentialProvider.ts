import bcrypt from 'bcryptjs';
import { DUMMY_AUTH_PASSWORD_HASH, validateBcryptPasswordByteLength } from '../../src/utils/authCredentials';

export type CredentialIdentity =
  | { provider: 'local'; userId: number; passwordHash: string }
  | { provider: 'firebase'; userId: number; projectId: string; uid: string; email: string };

export class CredentialProviderUnavailable extends Error {
  constructor() { super('Credential provider unavailable'); }
}

export interface FirebaseCredentialVerifier {
  projectId: string;
  /** Must use Admin SDK verifyIdToken(token, true), never decode-only JWT parsing. */
  verifyIdToken(token: string): Promise<{ uid: string; aud: string; auth_time: number }>;
}

/** Standalone preparation adapter. Existing endpoints remain local until lifecycle integration. */
export class CredentialProvider {
  constructor(private readonly firebase?: {
    apiKey: string;
    verifier: FirebaseCredentialVerifier;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }) {}

  async verify(identity: CredentialIdentity, password: string): Promise<boolean> {
    if (validateBcryptPasswordByteLength(password)) return false;
    if (identity.provider === 'local') {
      const matches = await bcrypt.compare(password, identity.passwordHash || DUMMY_AUTH_PASSWORD_HASH);
      return Boolean(identity.passwordHash) && matches;
    }
    if (!this.firebase || !this.firebase.apiKey || identity.projectId !== this.firebase.verifier.projectId) {
      throw new CredentialProviderUnavailable();
    }
    const { apiKey, verifier } = this.firebase;
    const timeoutMs = this.firebase.timeoutMs ?? 5000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new CredentialProviderUnavailable();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CredentialProviderUnavailable());
      }, timeoutMs);
    });
    try {
      return await Promise.race([timedOut, (async () => {
        const response = await (this.firebase!.fetch ?? fetch)(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: identity.email, password, returnSecureToken: true })
          }
        );
        const body = await response.json() as {
          idToken?: unknown; localId?: unknown; error?: { message?: unknown };
        };
        if (!response.ok) {
          const code = body?.error?.message;
          if (response.status === 400 && ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'USER_DISABLED'].includes(String(code))) {
            return false;
          }
          throw new CredentialProviderUnavailable();
        }
        if (typeof body?.idToken !== 'string' || body.localId !== identity.uid) return false;
        const verified = await verifier.verifyIdToken(body.idToken);
        const now = Math.floor(Date.now() / 1000);
        return verified.uid === identity.uid && verified.aud === identity.projectId &&
          Number.isSafeInteger(verified.auth_time) && verified.auth_time <= now + 30 && verified.auth_time >= now - 60;
        // The REST response's refreshToken and ID token are never returned, persisted, or logged.
      })()]);
    } catch {
      // Do not expose request URLs, passwords, tokens, or raw provider error text.
      throw new CredentialProviderUnavailable();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
