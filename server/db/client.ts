import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { env } from '../core/env.js';
import { logger } from '../core/logger.js';

let pool: pg.Pool | null = null;

/**
 * Hosted Postgres URLs (Supabase, Vercel Postgres) carry `sslmode=require`. Current `pg` treats
 * that as `verify-full` and lets it override the `ssl` option, so Node rejects the provider's
 * certificate chain ("self-signed certificate in certificate chain"). SSL settings are therefore
 * removed from the URL and set here:
 *   - local host: no SSL
 *   - DATABASE_CA_CERT set (PEM of the provider's CA): encrypted AND certificate verified
 *   - otherwise: encrypted, certificate not verified (same as the original configuration)
 */
export function buildConnectionOptions(rawUrl: string): { connectionString: string; ssl: false | { rejectUnauthorized: boolean; ca?: string } } {
  let connectionString = rawUrl;
  let host = '';
  try {
    const url = new URL(rawUrl);
    host = url.hostname;
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'sslnegotiation']) {
      url.searchParams.delete(key);
    }
    connectionString = url.toString();
  } catch {
    // Not a URL (e.g. key=value DSN): leave it unchanged.
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || /localhost|127\.0\.0\.1/.test(host);
  if (isLocal) return { connectionString, ssl: false };
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return { connectionString, ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false } };
}
const TOO_MANY_CONNECTIONS = /max clients reached|too many clients|too many connections|remaining connection slots|EMAXCONN|MaxClientsInSessionMode/i;

export function isTooManyConnectionsError(err: unknown): boolean {
  return TOO_MANY_CONNECTIONS.test(err instanceof Error ? err.message : String(err));
}

/**
 * Retries opening a connection when the server (or Supabase's pooler) refuses it because all
 * connection slots are in use — typically for a moment while other serverless instances finish.
 * Covers both pool.connect() and pool.query() (which uses the callback form of connect).
 */
export function installConnectRetry(target: pg.Pool, attempts = 6, baseDelayMs = 150): void {
  const raw = target.connect.bind(target) as () => Promise<pg.PoolClient>;
  const withRetry = async (): Promise<pg.PoolClient> => {
    for (let i = 0; ; i++) {
      try {
        return await raw();
      } catch (err) {
        if (i >= attempts - 1 || !isTooManyConnectionsError(err)) throw err;
        const delay = baseDelayMs * 2 ** i + Math.floor(Math.random() * baseDelayMs);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };
  (target as unknown as { connect: unknown }).connect = function (
    cb?: (err: Error | undefined, client?: pg.PoolClient, done?: (release?: unknown) => void) => void,
  ) {
    const p = withRetry();
    if (!cb) return p;
    p.then(
      (client) => cb(undefined, client, (release?: unknown) => client.release(release as Error | boolean | undefined)),
      (err) => cb(err as Error),
    );
    return undefined;
  };
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool(): pg.Pool | null {
  if (!pool && env.DATABASE_URL) {
    try {
      const { connectionString, ssl } = buildConnectionOptions(env.DATABASE_URL);
      // Serverless (Vercel) runs many small instances at once; each keeps its own pool. With
      // Supabase's session pooler (~15 connections in total) a pool of 10 per instance made
      // parallel requests fail with "max clients reached". Keep few connections per instance
      // and release idle ones quickly. Override with DB_POOL_MAX.
      const serverless = Boolean(process.env.VERCEL);
      const max = Number(process.env.DB_POOL_MAX) || (serverless ? 2 : 10);
      pool = new pg.Pool({
        connectionString,
        ssl,
        max,
        idleTimeoutMillis: serverless ? 5000 : 30000,
        connectionTimeoutMillis: 15000,
      });
      installConnectRetry(pool);

      pool.on('error', (err) => {
        logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
      });
    } catch (err: unknown) {
      logger.error('Failed to initialize PostgreSQL pool', { error: err instanceof Error ? err.message : String(err) });
      pool = null;
    }
  }
  return pool;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> | null {
  if (!dbInstance) {
    const currentPool = getDbPool();
    if (currentPool) {
      dbInstance = drizzle(currentPool, { schema });
    }
  }
  return dbInstance;
}

export async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unreachable' | 'not_configured'; latencyMs?: number; error?: string }> {
  if (!env.DATABASE_URL) {
    return { status: 'not_configured', error: 'DATABASE_URL is not set in environment' };
  }

  const currentPool = getDbPool();
  if (!currentPool) {
    return { status: 'unreachable', error: 'Database connection pool failed to initialize' };
  }

  const start = Date.now();
  try {
    const client = await currentPool.connect();
    try {
      await client.query('SELECT 1 AS health_check');
      const latencyMs = Date.now() - start;
      return { status: 'healthy', latencyMs };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    return {
      status: 'unreachable',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
