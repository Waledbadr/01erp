import '../src/lib/load-env';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { requireDatabaseUrl } from '../src/lib/env';

const client = new pg.Client({ connectionString: requireDatabaseUrl() });
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS app_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir(path.resolve('drizzle')))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of files) {
    const exists = await client.query(
      'SELECT 1 FROM app_schema_migrations WHERE name = $1',
      [name],
    );
    if (exists.rowCount) continue;
    const sql = await readFile(path.resolve('drizzle', name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO app_schema_migrations(name) VALUES ($1)',
        [name],
      );
      await client.query('COMMIT');
      console.log('Applied ' + name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
