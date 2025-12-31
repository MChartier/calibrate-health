import session from 'express-session';
import type { Pool } from 'pg';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const POSTGRES_UNDEFINED_TABLE_CODE = '42P01';

/**
 * Lightweight Postgres-backed session store to avoid in-memory session loss
 * when the server restarts. Data is serialized to JSONB alongside an
 * expiration timestamp so express-session can persist and prune sessions.
 */
export class PostgresSessionStore extends session.Store {
  private readonly pool: Pool;

  private readonly ttlMs: number;

  constructor(pool: Pool, ttlMs: number = DEFAULT_TTL_MS) {
    super();
    this.pool = pool;
    this.ttlMs = ttlMs;
  }

  /**
   * Verify the backing session table exists so deployments fail fast with a clear
   * error message instead of a runtime SQL failure during the first request.
   *
   * Table creation belongs in migrations (see backend/prisma/migrations).
   */
  async initialize(): Promise<void> {
    await this.assertSessionStoreSchema();
  }

  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      const result = await this.pool.query('SELECT sess, expire FROM session_store WHERE sid = $1', [sid]);
      const row = result.rows[0];

      if (!row) {
        callback(null, null);
        return;
      }

      const expires = new Date(row.expire);
      if (expires.getTime() <= Date.now()) {
        await this.destroy(sid, () => undefined);
        callback(null, null);
        return;
      }

      const parsedSession = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
      callback(null, parsedSession as session.SessionData);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, sess: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    const expire = this.calculateExpiry(sess);
    const sessionData = JSON.stringify(sess);

    try {
      await this.pool.query(
        `INSERT INTO session_store (sid, sess, expire)
         VALUES ($1, $2, $3)
         ON CONFLICT (sid)
         DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, sessionData, expire]
      );
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await this.pool.query('DELETE FROM session_store WHERE sid = $1', [sid]);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid: string, sess: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    const expire = this.calculateExpiry(sess);
    const sessionData = JSON.stringify(sess);

    try {
      await this.pool.query('UPDATE session_store SET expire = $2, sess = $3 WHERE sid = $1', [sid, expire, sessionData]);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  private calculateExpiry(sess: session.SessionData): Date {
    if (sess.cookie?.expires) {
      return new Date(sess.cookie.expires);
    }

    const maxAge = sess.cookie?.maxAge ?? this.ttlMs;
    return new Date(Date.now() + maxAge);
  }

  /**
   * Confirm the session_store table exists; throws a human-friendly error when
   * migrations have not been applied.
   */
  private async assertSessionStoreSchema(): Promise<void> {
    try {
      await this.pool.query('SELECT 1 FROM session_store LIMIT 1');
    } catch (error) {
      if (this.isUndefinedTableError(error)) {
        throw new Error(
          'Session store table is missing. Apply database migrations (npm run db:migrate) and restart the server.'
        );
      }

      throw error;
    }
  }

  /**
   * Detect the Postgres "undefined_table" error across pg driver versions.
   */
  private isUndefinedTableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const code = (error as { code?: unknown }).code;
    return code === POSTGRES_UNDEFINED_TABLE_CODE;
  }
}
