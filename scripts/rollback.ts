import '../src/lib/load-env';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { requireDatabaseUrl, readEnv } from '../src/lib/env';

if (readEnv().APP_ENV !== 'test')
  throw new Error('Rollback command is restricted to test environments');
const client = new pg.Client({ connectionString: requireDatabaseUrl() });
await client.connect();
try {
  const result = await client.query(
    'SELECT name FROM app_schema_migrations ORDER BY applied_at DESC, name DESC LIMIT 1',
  );
  const name = result.rows[0]?.name as string | undefined;
  if (!name) throw new Error('No applied migration to roll back');
  const sql = await readFile(path.resolve('drizzle', 'down', name), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('DELETE FROM app_schema_migrations WHERE name = $1', [
      name,
    ]);
    await client.query('COMMIT');
    console.log('Rolled back ' + name);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} finally {
  await client.end();
}
