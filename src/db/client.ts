import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requireDatabaseUrl } from '@/lib/env';
import * as schema from './schema';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool)
    pool = new Pool({ connectionString: requireDatabaseUrl(), max: 10 });
  return pool;
}

export function getDb() {
  return drizzle({ client: getPool(), schema });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
