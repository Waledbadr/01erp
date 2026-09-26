/**
 * Unit 1 acceptance: users, companies, memberships and sessions survive a server restart
 * and stay consistent across two concurrently running server processes.
 *
 * Runs against a REAL PostgreSQL database given by TEST_DATABASE_URL. The database's
 * `public` schema is dropped and recreated, so never point this at a database with real data.
 * Skipped (and reported as skipped) when TEST_DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { prepareTestDatabase } from './helpers/apiProcess.js';

const DB_URL = process.env.TEST_DATABASE_URL;
const ROOT = path.resolve(__dirname, '../..');

interface ApiProcess {
  base: string;
  proc: ChildProcess;
}

let nextPort = 4200 + Math.floor(Math.random() * 500);
let dbUrl = '';

async function startApi(): Promise<ApiProcess> {
  const port = nextPort++;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: dbUrl,
    POSTGRES_URL: '',
    POSTGRES_URL_NON_POOLING: '',
    POSTGRES_PRISMA_URL: '',
    TURNSTILE_SECRET_KEY: '',
    NODE_ENV: 'test',
    ERP_PERSISTENCE: 'on',
    SEED_DEMO_DATA: '',
    TEST_API_PORT: String(port),
    DOTENV_CONFIG_QUIET: 'true',
    LOG_LEVEL: 'error',
  };
  const proc = spawn(process.execPath, ['--import', 'tsx', 'scripts/test-api-server.ts'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start:\n${output}`)), 60_000);
    const onData = (d: Buffer) => {
      output += d.toString();
      if (output.includes('TEST_API_READY')) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout!.on('data', onData);
    proc.stderr!.on('data', (d: Buffer) => (output += d.toString()));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited early (${code}):\n${output}`));
    });
  });
  proc.removeAllListeners('exit');
  return { base: `http://127.0.0.1:${port}`, proc };
}

async function stopApi(api: ApiProcess | undefined) {
  if (!api || api.proc.exitCode !== null || api.proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    api.proc.once('exit', () => resolve());
    api.proc.kill('SIGKILL'); // hard kill: nothing gets a chance to "save on shutdown"
  });
}

async function call(api: ApiProcess, method: string, url: string, body?: unknown, token?: string, extra: Record<string, string> = {}) {
  const res = await fetch(api.base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const OWNER = { email: 'owner@persist-test.sa', password: 'Str0ng-Pass-2026' };

describe.skipIf(!DB_URL)('Identity persistence on PostgreSQL (restart & multi-instance)', () => {
  let pool: pg.Pool;
  const running: ApiProcess[] = [];
  const start = async () => {
    const api = await startApi();
    running.push(api);
    return api;
  };

  let ownerToken = '';
  let tenantId = '';
  let tenantCode = '';

  beforeAll(async () => {
    dbUrl = await prepareTestDatabase(DB_URL!, 'identity');
    pool = new pg.Pool({ connectionString: dbUrl });
    // Recreate Supabase's public API roles and their default grants, so the lock-down
    // migration is tested against the same exposure it has to close.
    for (const role of ['anon', 'authenticated']) {
      await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
      await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`);
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.all(running.map(stopApi));
    await pool?.end();
  });

  it('registers a company and its owner (process A)', async () => {
    const a = await start();
    const res = await call(a, 'POST', '/api/v1/auth/register', {
      companyNameAr: 'شركة اختبار الحفظ',
      companyNameEn: 'Persistence Test Co',
      adminFullName: 'Owner Test',
      adminEmail: OWNER.email,
      password: OWNER.password,
    });
    expect(res.status).toBe(201);
    ownerToken = res.body.token;
    tenantId = res.body.tenant.id;
    tenantCode = res.body.tenant.code;
    expect(tenantCode).toMatch(/^TNT-\d+$/);

    const me = await call(a, 'GET', '/api/v1/auth/me', undefined, ownerToken);
    expect(me.status).toBe(200);
    await stopApi(a);
  }, 90_000);

  it('stores rows in PostgreSQL and never stores the raw session token', async () => {
    const t = await pool.query('SELECT code FROM tenants WHERE id=$1', [tenantId]);
    expect(t.rows[0].code).toBe(tenantCode);
    const u = await pool.query('SELECT id FROM users WHERE email=$1', [OWNER.email]);
    expect(u.rows).toHaveLength(1);
    const m = await pool.query('SELECT role_code FROM tenant_memberships WHERE tenant_id=$1', [tenantId]);
    expect(m.rows.map((r) => r.role_code)).toEqual(['OWNER']);
    const b = await pool.query('SELECT is_main_branch FROM branches WHERE tenant_id=$1', [tenantId]);
    expect(b.rows).toHaveLength(1);
    const s = await pool.query('SELECT token_hash, data::text AS data FROM user_sessions');
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].data).not.toContain(ownerToken);
    expect(s.rows[0].token_hash).not.toBe(ownerToken);
  });

  it('public API roles (Supabase anon/authenticated) cannot read or write identity tables', async () => {
    const tables = ['tenants', 'branches', 'users', 'tenant_memberships', 'user_sessions', 'user_invites', 'auth_tokens', 'login_history'];
    for (const t of tables) {
      const rls = await pool.query('SELECT relrowsecurity FROM pg_class WHERE relname=$1', [t]);
      expect(rls.rows[0].relrowsecurity, `RLS on ${t}`).toBe(true);
      for (const role of ['anon', 'authenticated']) {
        const p = await pool.query(
          `SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT')
               OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') AS any`,
          [role, t],
        );
        expect(p.rows[0].any, `${role} privileges on ${t}`).toBe(false);
      }
    }
    // Even acting as anon inside the database, no row is visible.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      await expect(client.query('SELECT * FROM users')).rejects.toThrow(/permission denied/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('tables created after the migrations do not inherit public API access', async () => {
    await pool.query('CREATE TABLE future_table_check (id int)');
    await pool.query('CREATE SEQUENCE future_seq_check');
    for (const role of ['anon', 'authenticated']) {
      const t = await pool.query(`SELECT has_table_privilege($1, 'future_table_check', 'SELECT') AS v`, [role]);
      expect(t.rows[0].v, `${role} on a new table`).toBe(false);
      const q = await pool.query(`SELECT has_sequence_privilege($1, 'future_seq_check', 'USAGE') AS v`, [role]);
      expect(q.rows[0].v, `${role} on a new sequence`).toBe(false);
    }
    await pool.query('DROP TABLE future_table_check; DROP SEQUENCE future_seq_check;');
  });

  it('after a hard restart (process B) the session, user and company are still there', async () => {
    const b = await start();
    const me = await call(b, 'GET', '/api/v1/auth/me', undefined, ownerToken);
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).toContain(tenantId);

    // Default scaffolding is rebuilt for the loaded company.
    const accounts = await call(b, 'GET', '/api/v1/accounting/accounts', undefined, ownerToken);
    expect(accounts.status).toBe(200);
    expect(JSON.stringify(accounts.body).length).toBeGreaterThan(1000);

    const login = await call(b, 'POST', '/api/v1/auth/login', { email: OWNER.email, password: OWNER.password });
    expect(login.status).toBe(200);
    expect(login.body.activeTenantId).toBe(tenantId);
    expect(login.body.companies.map((c: any) => c.tenant.id)).toContain(tenantId);

    const bad = await call(b, 'POST', '/api/v1/auth/login', { email: OWNER.email, password: 'wrong-password-1' });
    expect(bad.status).toBe(401);
    await stopApi(b);
  }, 90_000);

  it('rejects re-registering an existing e-mail with a wrong password after restart', async () => {
    const c = await start();
    const res = await call(c, 'POST', '/api/v1/auth/register', {
      companyNameAr: 'شركة أخرى',
      adminFullName: 'Someone',
      adminEmail: OWNER.email,
      password: 'another-password-9',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMAIL_ALREADY_EXISTS');
    const users = await pool.query('SELECT count(*)::int AS n FROM users WHERE email=$1', [OWNER.email]);
    expect(users.rows[0].n).toBe(1);
    await stopApi(c);
  }, 90_000);

  it('keeps two running processes consistent (invite on A, login on B; logout on B, rejected on A)', async () => {
    const a = await start();
    const b = await start();

    const invite = await call(a, 'POST', '/api/v1/users/invite', {
      email: 'accountant@persist-test.sa',
      roleCode: 'ACCOUNTANT',
      defaultPassword: 'Accountant-Pass-2026',
    }, ownerToken);
    expect(invite.status).toBeLessThan(300);

    const login = await call(b, 'POST', '/api/v1/auth/login', {
      email: 'accountant@persist-test.sa',
      password: 'Accountant-Pass-2026',
    });
    expect(login.status).toBe(200);
    expect(login.body.activeTenantId).toBe(tenantId);
    const accountantToken = login.body.token;

    // Session created on B is valid on A.
    expect((await call(a, 'GET', '/api/v1/auth/me', undefined, accountantToken)).status).toBe(200);

    // Logout on B revokes it on A, even though A has it cached in memory.
    expect((await call(b, 'POST', '/api/v1/auth/logout', {}, accountantToken)).status).toBe(200);
    expect((await call(a, 'GET', '/api/v1/auth/me', undefined, accountantToken)).status).toBe(401);

    await stopApi(a);
    await stopApi(b);
  }, 120_000);

  it('terminate-others revokes sessions this process has never seen', async () => {
    const a = await start();
    const other = await call(a, 'POST', '/api/v1/auth/login', { email: OWNER.email, password: OWNER.password });
    expect(other.status).toBe(200);
    await stopApi(a);

    const b = await start(); // fresh process: knows neither token
    const res = await call(b, 'POST', '/api/v1/auth/sessions/terminate-others', {}, ownerToken);
    expect(res.status).toBe(200);
    expect((await call(b, 'GET', '/api/v1/auth/me', undefined, other.body.token)).status).toBe(401);
    expect((await call(b, 'GET', '/api/v1/auth/me', undefined, ownerToken)).status).toBe(200);
    await stopApi(b);
  }, 120_000);

  it('gives each new company a unique code from the database sequence', async () => {
    const a = await start();
    const res = await call(a, 'POST', '/api/v1/auth/register', {
      companyNameAr: 'شركة ثانية',
      adminFullName: 'Second Owner',
      adminEmail: 'second@persist-test.sa',
      password: 'Second-Pass-2026',
    });
    expect(res.status).toBe(201);
    expect(res.body.tenant.code).not.toBe(tenantCode);
    await stopApi(a);
  }, 90_000);

  it('does not seed demo accounts with a published password when a database is used', async () => {
    const a = await start();
    const res = await call(a, 'POST', '/api/v1/auth/login', { email: 'superadmin@saudi-erp.com', password: 'SuperSecret2026!' });
    expect(res.status).toBe(401);
    await stopApi(a);
  }, 90_000);

  it('rejects unauthenticated billing calls that name a tenant in a header', async () => {
    const a = await start();
    const res = await call(a, 'POST', '/api/v1/billing/subscription/cancel', {}, undefined, {
      'x-tenant-id': tenantId,
      'x-superadmin': 'true',
    });
    expect(res.status).toBe(401);
    await stopApi(a);
  }, 90_000);
});
