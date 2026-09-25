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
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool(): pg.Pool | null {
  if (!pool && env.DATABASE_URL) {
    try {
      const { connectionString, ssl } = buildConnectionOptions(env.DATABASE_URL);
      pool = new pg.Pool({
        connectionString,
        ssl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

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
