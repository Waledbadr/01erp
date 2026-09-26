/**
 * When the database refuses new connections because all slots are taken (Supabase session
 * pooler "max clients reached", Postgres "too many connections"), requests must wait and retry
 * instead of failing with 503. Uses a real PostgreSQL role limited to 2 connections.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { installConnectRetry } from '../../server/db/client.js';

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)('connection retry when the server is out of connection slots', () => {
  let admin: pg.Pool;
  const role = `limited_${Date.now()}`;
  let limitedUrl = '';

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: DB_URL });
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'x' CONNECTION LIMIT 2`);
    const u = new URL(DB_URL!);
    u.username = role;
    u.password = 'x';
    limitedUrl = u.toString();
  });

  afterAll(async () => {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1`, [role]);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  });

  const burst = (p: pg.Pool) => Promise.allSettled(Array.from({ length: 8 }, () => p.query('SELECT pg_sleep(0.2)')));

  it('without retry, a burst larger than the server limit fails (reproduces the production 503)', async () => {
    const p = new pg.Pool({ connectionString: limitedUrl, max: 8 });
    const r = await burst(p);
    await p.end();
    expect(r.filter((x) => x.status === 'rejected').length).toBeGreaterThan(0);
  });

  it('with retry, the same burst succeeds', async () => {
    const p = new pg.Pool({ connectionString: limitedUrl, max: 8 });
    installConnectRetry(p);
    const r = await burst(p);
    await p.end();
    expect(r.filter((x) => x.status === 'rejected')).toEqual([]);
  }, 30_000);
});
