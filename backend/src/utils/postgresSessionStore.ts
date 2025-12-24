import session from 'express-session';
import type { Pool } from 'pg';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

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

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS session_store (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS session_store_expire_idx ON session_store (expire);
    `);
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
}
