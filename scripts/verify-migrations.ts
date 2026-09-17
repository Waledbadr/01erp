import '../src/lib/load-env';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const port = await new Promise<number>((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string')
      return reject(new Error('No scratch port'));
    server.close(() => resolve(address.port));
  });
});
const postgres = new EmbeddedPostgres({
  databaseDir: path.resolve('scratch-db/pg'),
  user: 'postgres',
  password: 'test_only',
  port,
  persistent: false,
  initdbFlags: ['--locale=C', '--encoding=UTF8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
});
await postgres.initialise();
await postgres.start();
const url = 'postgresql://postgres:test_only@127.0.0.1:' + port + '/postgres';
const env = { ...process.env, APP_ENV: 'test', DATABASE_URL: url };
process.env.DATABASE_URL = url;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(script: string) {
  execFileSync(npm, ['run', script], {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const version = await client.query('select version()');
  console.log(version.rows[0].version);
  run('db:migrate');
  run('db:seed:system');
  let invalidTaxRejected = false;
  try {
    await client.query(
      "INSERT INTO system_tax_rates (code, rate, classification) VALUES ('invalid_rate', '-0.1', 'standard')",
    );
  } catch {
    invalidTaxRejected = true;
  }
  if (!invalidTaxRejected)
    throw new Error('Tax rate database check did not reject a negative rate');
  const first = await client.query(
    'select count(*)::int as count from system_roles',
  );
  if (first.rows[0].count !== 6)
    throw new Error('Expected six system roles after seed');
  run('db:seed:system');
  const repeated = await client.query(
    'select count(*)::int as count from system_roles',
  );
  if (repeated.rows[0].count !== 6)
    throw new Error('System seed is not idempotent');
  run('db:rollback');
  const missing = await client.query(
    "select to_regclass('public.system_roles') as name",
  );
  if (missing.rows[0].name !== null)
    throw new Error('Rollback left a system table');
  run('db:migrate');
  run('db:seed:system');
  const again = await client.query(
    'select count(*)::int as count from system_roles',
  );
  if (again.rows[0].count !== 6) throw new Error('Reapply failed');
  const { databaseReady } = await import('../src/server/core/health');
  if (!(await databaseReady()))
    throw new Error('Readiness failed with a real database');
  console.log('Migration up/down/up, system seed, and readiness verified');
} finally {
  await client.end();
  const { closePool } = await import('../src/db/client');
  await closePool();
  await postgres.stop();
}
