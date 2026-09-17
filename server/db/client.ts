import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { env } from '../core/env.js';
import { logger } from '../core/logger.js';

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool(): pg.Pool | null {
  if (!pool && env.DATABASE_URL) {
    try {
      pool = new pg.Pool({
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
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
