/**
 * Unit 1 persistence: users, companies (tenants), branches, memberships, sessions,
 * invites, short-lived auth tokens and login history are stored in PostgreSQL.
 *
 * How it works (per API request, only when env.PERSISTENCE_ENABLED):
 *   1. Load:  the records the request needs (its session, the user, the user's companies,
 *             any e-mail / token in the body) are read from PostgreSQL into centralStore.
 *             PostgreSQL is authoritative: loaded rows overwrite the in-memory copy.
 *   2. Run:   the existing route handlers run unchanged against centralStore.
 *   3. Save:  before the JSON response is sent, every identity record that changed is
 *             written in ONE transaction. If the write fails the client gets HTTP 500 and
 *             records that were never saved are removed from memory again.
 *
 * A company loaded into a fresh process gets its default scaffolding (chart of accounts,
 * warehouse, sequences, periods ...) rebuilt by initializeTenantDefaults. Operational data
 * (journals, items, invoices, stock ...) is NOT persisted by this unit yet.
 *
 * Records that exist when this module first runs (in-memory demo seed) are treated as
 * ephemeral and are never written, nor is anything that depends on them.
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import { env } from '../core/env.js';
import { logger } from '../core/logger.js';
import { getDbPool } from './client.js';
import { applyMigrations } from './migrations.js';
import { acquireTenantLock, commitTenantLock, rollbackTenantLock, saveNewTenants, type TenantLock } from './tenantStatePersistence.js';
import {
  centralStore,
  type CompanyTenant,
  type Branch,
  type User,
  type UserMembership,
  type UserSession,
  type UserInvite,
  type LoginHistoryEntry,
} from '../core/tenantGuard.js';

type Kind = 'tenant' | 'user' | 'branch' | 'membership' | 'invite' | 'session' | 'token' | 'login';

interface Entry {
  kind: Kind;
  key: string; // compound key, e.g. "user:<id>"
  hash: string;
  deps: string[];
  params: unknown[];
  /** Raw in-memory map key (session token / auth-token key), needed to discard on failure. */
  rawKey?: string;
  tenantId?: string;
}

const store = centralStore;

/** compound key -> hash of the version currently stored in PostgreSQL */
const known = new Map<string, string>();
/** compound keys that must never be written (demo seed present at start-up) */
const ephemeral = new Set<string>();

let initialised = false;
let readyPromise: Promise<void> | null = null;
let flushChain: Promise<void> = Promise.resolve();

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const hashOf = (o: unknown) => sha256(JSON.stringify(o));
const MINUTE = 60_000;

/**
 * Sessions are keyed in memory by their raw token, which is never stored. Sessions loaded
 * from the database without their token (other devices of the same user) are kept under a
 * placeholder key "__sha256:<hash>". No real token can match it, so it cannot be used to
 * log in, but it can be listed and revoked by the session-management endpoints.
 */
const PLACEHOLDER = '__sha256:';
const tokenHashOf = (mapKey: string) => (mapKey.startsWith(PLACEHOLDER) ? mapKey.slice(PLACEHOLDER.length) : sha256(mapKey));

// ------------------------------------------------------------------
// Snapshot of the identity part of centralStore
// ------------------------------------------------------------------
function sessionData(s: UserSession): Record<string, unknown> {
  const { sessionToken: _omit, ...rest } = s;
  return rest;
}

function sessionHash(s: UserSession): string {
  // lastActiveAt / expiresAt slide on every request; only persist them at minute granularity.
  const d = sessionData(s);
  d.lastActiveAt = s.lastActiveAt ? Math.floor(s.lastActiveAt / MINUTE) : s.lastActiveAt;
  d.expiresAt = Math.floor(s.expiresAt / MINUTE);
  return hashOf(d);
}

function collect(): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const put = (e: Entry) => out.set(e.key, e);

  for (const t of store.tenants.values()) {
    put({
      kind: 'tenant',
      key: `tenant:${t.id}`,
      hash: hashOf(t),
      deps: [],
      tenantId: t.id,
      params: [t.id, t.code, t.nameAr, t.nameEn || t.nameAr, t.vatNumber || '', t.crNumber || '', !!t.isSuspended, JSON.stringify(t)],
    });
  }
  for (const u of store.users.values()) {
    put({
      kind: 'user',
      key: `user:${u.id}`,
      hash: hashOf(u),
      deps: [],
      params: [u.id, u.email.toLowerCase(), u.passwordHash, u.isActive, u.isPlatformSuperAdmin, JSON.stringify(u)],
    });
  }
  for (const [tenantId, list] of store.branches.entries()) {
    for (const b of list) {
      put({
        kind: 'branch',
        key: `branch:${b.id}`,
        hash: hashOf(b),
        deps: [`tenant:${tenantId}`],
        tenantId,
        params: [b.id, tenantId, b.code, !!b.isMainBranch, JSON.stringify(b)],
      });
    }
  }
  for (const [tenantId, list] of store.memberships.entries()) {
    for (const m of list) {
      put({
        kind: 'membership',
        key: `membership:${m.id}`,
        hash: hashOf(m),
        deps: [`tenant:${tenantId}`, `user:${m.userId}`],
        tenantId,
        params: [m.id, tenantId, m.userId, m.roleCode, m.branchId || null, m.isActive, JSON.stringify(m)],
      });
    }
  }
  for (const [tenantId, list] of store.invites.entries()) {
    for (const i of list) {
      put({
        kind: 'invite',
        key: `invite:${i.id}`,
        hash: hashOf(i),
        deps: [`tenant:${tenantId}`],
        tenantId,
        params: [i.id, tenantId, i.email, JSON.stringify(i)],
      });
    }
  }
  for (const [token, s] of store.sessions.entries()) {
    const h = tokenHashOf(token);
    put({
      kind: 'session',
      key: `session:${h}`,
      hash: sessionHash(s),
      deps: [`user:${s.userId}`],
      rawKey: token,
      params: [h, s.userId, s.tenantId || '', new Date(s.expiresAt), JSON.stringify(sessionData(s))],
    });
  }
  for (const [k, v] of store.passwordResetTokens.entries()) {
    const h = sha256(k);
    put({
      kind: 'token',
      key: `token:${h}`,
      hash: hashOf(v),
      deps: [],
      rawKey: k,
      params: [h, v.email, new Date(v.expiresAt)],
    });
  }
  for (const l of store.loginHistory) {
    put({
      kind: 'login',
      key: `login:${l.id}`,
      hash: 'append-only',
      deps: l.userId ? [`user:${l.userId}`] : [],
      params: [l.id, l.userId || null, l.email, l.tenantId || null, l.status, JSON.stringify(l), l.timestamp],
    });
  }
  return out;
}

const UPSERT: Record<Kind, string> = {
  tenant: `INSERT INTO tenants (id, code, name_ar, name_en, vat_number, cr_number, is_suspended, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET code=$2, name_ar=$3, name_en=$4, vat_number=$5, cr_number=$6,
             is_suspended=$7, data=$8, updated_at=NOW()`,
  user: `INSERT INTO users (id, email, password_hash, is_active, is_platform_super_admin, data)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET email=$2, password_hash=$3, is_active=$4,
           is_platform_super_admin=$5, data=$6, updated_at=NOW()`,
  branch: `INSERT INTO branches (id, tenant_id, code, is_main_branch, data) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET code=$3, is_main_branch=$4, data=$5`,
  membership: `INSERT INTO tenant_memberships (id, tenant_id, user_id, role_code, branch_id, is_active, data)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (id) DO UPDATE SET role_code=$4, branch_id=$5, is_active=$6, data=$7`,
  invite: `INSERT INTO user_invites (id, tenant_id, email, data) VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET email=$3, data=$4`,
  session: `INSERT INTO user_sessions (token_hash, user_id, tenant_id, expires_at, data) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (token_hash) DO UPDATE SET tenant_id=$3, expires_at=$4, data=$5`,
  token: `INSERT INTO auth_tokens (key_hash, email, expires_at) VALUES ($1,$2,$3)
          ON CONFLICT (key_hash) DO UPDATE SET email=$2, expires_at=$3`,
  login: `INSERT INTO login_history (id, user_id, email, tenant_id, status, data, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
};

// Tenants, users and login history are never deleted automatically (a tenant or user
// disappearing from memory is far more likely a bug or a restore than a real delete).
const DELETE: Partial<Record<Kind, string>> = {
  branch: 'DELETE FROM branches WHERE id=$1',
  membership: 'DELETE FROM tenant_memberships WHERE id=$1',
  invite: 'DELETE FROM user_invites WHERE id=$1',
  session: 'DELETE FROM user_sessions WHERE token_hash=$1',
  token: 'DELETE FROM auth_tokens WHERE key_hash=$1',
};

const ORDER: Kind[] = ['tenant', 'user', 'branch', 'membership', 'invite', 'session', 'token', 'login'];

// ------------------------------------------------------------------
// Save
// ------------------------------------------------------------------
async function flushOnce(pool: pg.Pool): Promise<void> {
  const current = collect();

  // Which entries may be written: not ephemeral, and every dependency is stored or being stored.
  const verdict = new Map<string, boolean>();
  const writable = (key: string, seen = new Set<string>()): boolean => {
    if (verdict.has(key)) return verdict.get(key)!;
    if (ephemeral.has(key) || seen.has(key)) return false;
    const e = current.get(key);
    if (!e) return known.has(key);
    seen.add(key);
    const ok = e.deps.every((d) => writable(d, seen));
    verdict.set(key, ok);
    return ok;
  };

  const upserts: Entry[] = [];
  for (const e of current.values()) {
    if (known.get(e.key) === e.hash) continue;
    if (!writable(e.key)) {
      if (!ephemeral.has(e.key)) ephemeral.add(e.key); // depends on demo data -> stays in memory only
      continue;
    }
    upserts.push(e);
  }
  const deletes: string[] = [];
  for (const key of known.keys()) {
    if (current.has(key)) continue;
    const kind = key.slice(0, key.indexOf(':')) as Kind;
    if (DELETE[kind]) deletes.push(key);
  }
  if (!upserts.length && !deletes.length) return;

  upserts.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of upserts) await client.query(UPSERT[e.kind], e.params);
    for (const key of deletes) {
      const kind = key.slice(0, key.indexOf(':')) as Kind;
      await client.query(DELETE[kind]!, [key.slice(key.indexOf(':') + 1)]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    discardUnsaved(upserts.filter((e) => !known.has(e.key)));
    throw err;
  } finally {
    client.release();
  }
  for (const e of upserts) known.set(e.key, e.hash);
  for (const key of deletes) known.delete(key);
}

/** Removes records that were created in memory but could not be saved. */
function discardUnsaved(entries: Entry[]): void {
  for (const e of entries) {
    const id = e.key.slice(e.key.indexOf(':') + 1);
    switch (e.kind) {
      case 'tenant':
        store.tenants.delete(id);
        store.branches.delete(id);
        store.memberships.delete(id);
        store.invites.delete(id);
        break;
      case 'user': {
        const u = store.users.get(id);
        if (u && store.userByEmail.get(u.email) === id) store.userByEmail.delete(u.email);
        store.users.delete(id);
        break;
      }
      case 'session':
        if (e.rawKey) store.sessions.delete(e.rawKey);
        break;
      case 'token':
        if (e.rawKey) store.passwordResetTokens.delete(e.rawKey);
        break;
      case 'membership':
      case 'branch':
      case 'invite': {
        const map = e.kind === 'membership' ? store.memberships : e.kind === 'branch' ? store.branches : store.invites;
        const list = e.tenantId ? (map.get(e.tenantId) as { id: string }[] | undefined) : undefined;
        if (list) {
          const idx = list.findIndex((x) => x.id === id);
          if (idx >= 0) list.splice(idx, 1);
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Serialised flush of all pending identity changes. */
export function flushIdentityChanges(): Promise<void> {
  const pool = getDbPool();
  if (!env.PERSISTENCE_ENABLED || !pool) return Promise.resolve();
  const run = flushChain.then(() => flushOnce(pool));
  flushChain = run.catch(() => undefined);
  return run;
}

// ------------------------------------------------------------------
// Load
// ------------------------------------------------------------------
function putUser(row: { password_hash: string; is_active: boolean; is_platform_super_admin: boolean; data: User }): User {
  const loaded: User = {
    ...row.data,
    passwordHash: row.password_hash,
    isActive: row.is_active,
    isPlatformSuperAdmin: row.is_platform_super_admin,
  };
  const existing = store.users.get(loaded.id);
  let user: User;
  if (existing) {
    Object.assign(existing, loaded);
    user = existing;
  } else {
    store.users.set(loaded.id, loaded);
    user = loaded;
  }
  store.userByEmail.set(user.email.toLowerCase(), user.id);
  known.set(`user:${user.id}`, hashOf(user));
  return user;
}

/** Replaces the persisted items of a per-tenant list, reusing existing objects. */
function mergeList<T extends { id: string }>(map: Map<string, T[]>, tenantId: string, rows: T[], kind: Kind): void {
  const list = map.get(tenantId) || [];
  const byId = new Map(list.map((x) => [x.id, x]));
  const merged = rows.map((r) => {
    const cur = byId.get(r.id);
    if (cur) return Object.assign(cur, r);
    return r;
  });
  // keep in-memory items that were never persisted and are not known deletions
  for (const x of list) {
    if (!rows.some((r) => r.id === x.id) && !known.has(`${kind}:${x.id}`)) merged.push(x);
  }
  list.splice(0, list.length, ...merged);
  map.set(tenantId, list);
  for (const x of list) if (rows.some((r) => r.id === x.id)) known.set(`${kind}:${x.id}`, hashOf(x));
}

async function loadTenant(pool: pg.Pool, tenantId: string): Promise<CompanyTenant | null> {
  if (!tenantId) return null;
  const [t, b, m, i] = await Promise.all([
    pool.query('SELECT is_suspended, data FROM tenants WHERE id=$1', [tenantId]),
    pool.query('SELECT data FROM branches WHERE tenant_id=$1 ORDER BY created_at, id', [tenantId]),
    pool.query('SELECT data, role_code, branch_id, is_active FROM tenant_memberships WHERE tenant_id=$1 ORDER BY created_at, id', [tenantId]),
    pool.query('SELECT data FROM user_invites WHERE tenant_id=$1 ORDER BY created_at, id', [tenantId]),
  ]);
  if (!t.rows.length) {
    // Deleted or never stored: forget a stale copy that was previously loaded from the DB.
    if (known.has(`tenant:${tenantId}`) && !ephemeral.has(`tenant:${tenantId}`)) {
      store.tenants.delete(tenantId);
      known.delete(`tenant:${tenantId}`);
    }
    return null;
  }
  const loaded: CompanyTenant = { ...t.rows[0].data, isSuspended: t.rows[0].is_suspended };
  const branches: Branch[] = b.rows.map((r) => r.data);
  const memberships: UserMembership[] = m.rows.map((r) => ({
    ...r.data,
    roleCode: r.role_code,
    branchId: r.branch_id || undefined,
    isActive: r.is_active,
  }));
  const invites: UserInvite[] = i.rows.map((r) => r.data);

  let tenant = store.tenants.get(tenantId);
  if (!tenant) {
    tenant = loaded;
    store.tenants.set(tenantId, tenant);
    store.branches.set(tenantId, branches);
    const main = branches.find((x) => x.isMainBranch) || branches[0];
    if (main) store.initializeTenantDefaults(tenant, main);
    else logger.warn('Persisted tenant has no branch; default scaffolding not rebuilt', { tenantId });
    for (const x of branches) known.set(`branch:${x.id}`, hashOf(x));
  } else {
    Object.assign(tenant, loaded);
    mergeList(store.branches, tenantId, branches, 'branch');
  }
  known.set(`tenant:${tenantId}`, hashOf(tenant));
  mergeList(store.memberships, tenantId, memberships, 'membership');
  mergeList(store.invites, tenantId, invites, 'invite');

  const userIds = [...new Set(memberships.map((x) => x.userId))];
  if (userIds.length) {
    const u = await pool.query('SELECT password_hash, is_active, is_platform_super_admin, data FROM users WHERE id = ANY($1)', [userIds]);
    u.rows.forEach(putUser);
  }
  return tenant;
}

/** Loads a user's companies (with their members) and the user's live sessions. */
async function loadUserContext(pool: pg.Pool, user: User): Promise<void> {
  const [mem, ses] = await Promise.all([
    pool.query('SELECT DISTINCT tenant_id FROM tenant_memberships WHERE user_id=$1', [user.id]),
    pool.query('SELECT token_hash, data FROM user_sessions WHERE user_id=$1 AND expires_at > NOW()', [user.id]),
  ]);
  await Promise.all(mem.rows.map((r) => loadTenant(pool, r.tenant_id)));

  // Refresh this user's sessions that are in memory, drop the ones revoked elsewhere,
  // and add the others under a placeholder key (see PLACEHOLDER).
  const byHash = new Map(ses.rows.map((r) => [r.token_hash as string, r.data as UserSession]));
  const seen = new Set<string>();
  for (const [mapKey, s] of [...store.sessions.entries()]) {
    if (s.userId !== user.id) continue;
    const h = tokenHashOf(mapKey);
    const key = `session:${h}`;
    const row = byHash.get(h);
    if (row) {
      seen.add(h);
      Object.assign(s, row, mapKey.startsWith(PLACEHOLDER) ? {} : { sessionToken: mapKey });
      known.set(key, sessionHash(s));
    } else if (known.has(key)) {
      store.sessions.delete(mapKey); // revoked or expired elsewhere
      known.delete(key);
    }
  }
  for (const [h, data] of byHash.entries()) {
    if (seen.has(h)) continue;
    const s = { ...data } as UserSession;
    store.sessions.set(PLACEHOLDER + h, s);
    known.set(`session:${h}`, sessionHash(s));
  }

  if (user.isPlatformSuperAdmin) {
    const all = await pool.query('SELECT id FROM tenants ORDER BY created_at');
    await Promise.all(all.rows.map((r) => loadTenant(pool, r.id)));
  }
}

async function loadUserByEmail(pool: pg.Pool, email: string): Promise<User | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const r = await pool.query('SELECT password_hash, is_active, is_platform_super_admin, data FROM users WHERE email=$1', [clean]);
  if (!r.rows.length) return null;
  const user = putUser(r.rows[0]);
  await loadUserContext(pool, user);
  return user;
}

async function loadSession(pool: pg.Pool, token: string): Promise<void> {
  const h = sha256(token);
  const key = `session:${h}`;
  const r = await pool.query('SELECT data FROM user_sessions WHERE token_hash=$1', [h]);
  if (!r.rows.length) {
    if (!ephemeral.has(key)) {
      store.sessions.delete(token); // logged out / revoked on another instance
      known.delete(key);
    }
    return;
  }
  const loaded: UserSession = { ...r.rows[0].data, sessionToken: token };
  store.sessions.delete(PLACEHOLDER + h); // same record, now reachable by its real token
  const existing = store.sessions.get(token);
  const session = existing ? Object.assign(existing, loaded) : loaded;
  store.sessions.set(token, session);
  known.set(key, sessionHash(session));

  const u = await pool.query('SELECT password_hash, is_active, is_platform_super_admin, data FROM users WHERE id=$1', [session.userId]);
  if (!u.rows.length) return;
  const user = putUser(u.rows[0]);
  await loadUserContext(pool, user);
  if (session.tenantId && !store.tenants.has(session.tenantId)) await loadTenant(pool, session.tenantId);
}

async function loadAuthToken(pool: pg.Pool, rawKey: string): Promise<string | null> {
  const h = sha256(rawKey);
  const r = await pool.query('SELECT email, expires_at FROM auth_tokens WHERE key_hash=$1', [h]);
  if (!r.rows.length) {
    if (known.has(`token:${h}`)) {
      store.passwordResetTokens.delete(rawKey);
      known.delete(`token:${h}`);
    }
    return null;
  }
  const v = { email: r.rows[0].email as string, expiresAt: new Date(r.rows[0].expires_at).getTime() };
  store.passwordResetTokens.set(rawKey, v);
  known.set(`token:${h}`, hashOf(v));
  return v.email;
}

async function loadLoginHistory(pool: pg.Pool, userId: string): Promise<void> {
  const r = await pool.query('SELECT data FROM login_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [userId]);
  const have = new Set(store.loginHistory.map((l) => l.id));
  for (const row of r.rows as { data: LoginHistoryEntry }[]) {
    if (!have.has(row.data.id)) store.loginHistory.push(row.data);
    known.set(`login:${row.data.id}`, 'append-only');
  }
  store.loginHistory.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

// ------------------------------------------------------------------
// Start-up
// ------------------------------------------------------------------
function markStartupDataEphemeral(): void {
  for (const key of collect().keys()) ephemeral.add(key);
}

export function ensureIdentityPersistenceReady(): Promise<void> {
  if (!env.PERSISTENCE_ENABLED) return Promise.resolve();
  if (!initialised) {
    initialised = true;
    markStartupDataEphemeral();
  }
  if (!readyPromise) {
    const pool = getDbPool();
    if (!pool) return Promise.reject(new Error('DATABASE_URL is set but the PostgreSQL pool could not be created.'));
    readyPromise = applyMigrations(pool).then((applied) => {
      if (applied.length) logger.info('Database migrations applied', { applied });
    });
    readyPromise.catch(() => {
      readyPromise = null; // retry on the next request
    });
  }
  return readyPromise;
}

/** Reserves the next unique company code (TNT-1001, TNT-1002 ...). */
export async function reserveTenantCode(): Promise<string> {
  const pool = getDbPool()!;
  const r = await pool.query<{ n: string }>(`SELECT nextval('tenant_code_seq') AS n`);
  return `TNT-${r.rows[0].n}`;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  let token: string | undefined;
  if (auth && auth.startsWith('Bearer ')) token = auth.substring(7).trim();
  else if (req.headers['x-session-token']) token = String(req.headers['x-session-token']).trim();
  if (!token || token.startsWith('sk_live_')) return null;
  return token;
}

const TENANT_CREATING_ROUTES = /\/auth\/(register|create-company)\/?$/;

/**
 * Express middleware. Mount after the body parsers and before authMiddleware.
 * No-op when persistence is disabled.
 */
export async function identityPersistenceMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!env.PERSISTENCE_ENABLED) return next();
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith('/api') || /\/health\//.test(path)) return next();

  const pool = getDbPool();
  let tenantLock: TenantLock | null = null;
  const tenantsBefore = new Set(store.tenants.keys());
  try {
    await ensureIdentityPersistenceReady();
    if (!pool) throw new Error('PostgreSQL pool unavailable');

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const token = extractToken(req);
    if (token) await loadSession(pool, token);

    for (const field of ['email', 'adminEmail']) {
      if (typeof body[field] === 'string') await loadUserByEmail(pool, body[field] as string);
    }
    if (typeof body.mfaToken === 'string') {
      const email = await loadAuthToken(pool, `mfa:${body.mfaToken}`);
      if (email) await loadUserByEmail(pool, email);
    }
    if (typeof body.token === 'string' && /reset-password/.test(path)) {
      const email = await loadAuthToken(pool, `reset:${body.token}`);
      if (email) await loadUserByEmail(pool, email);
    }
    if (typeof body.targetCompanyId === 'string') await loadTenant(pool, body.targetCompanyId);
    if (token && /login-history/.test(path)) {
      const s = store.sessions.get(token);
      if (s) await loadLoginHistory(pool, s.userId);
    }
    if (req.method === 'POST' && TENANT_CREATING_ROUTES.test(path)) {
      res.locals.reservedTenantCode = await reserveTenantCode();
    }

    // Company data: lock the signed-in company's snapshot and make sure memory is current.
    const sessionTenant = token ? store.sessions.get(token)?.tenantId : undefined;
    if (sessionTenant && known.has(`tenant:${sessionTenant}`) && !ephemeral.has(`tenant:${sessionTenant}`)) {
      tenantLock = await acquireTenantLock(pool, sessionTenant);
    }
  } catch (err) {
    if (tenantLock) await rollbackTenantLock(tenantLock);
    logger.error('Identity persistence: load failed', { error: err instanceof Error ? err.message : String(err), path });
    return res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'تعذر الوصول إلى قاعدة البيانات. يرجى المحاولة لاحقاً.',
    });
  }

  // Identity rows first (new companies need their tenants row), then company data.
  const saveAll = async () => {
    await flushIdentityChanges();
    const created = [...store.tenants.keys()].filter(
      (id) => !tenantsBefore.has(id) && known.has(`tenant:${id}`) && !ephemeral.has(`tenant:${id}`),
    );
    if (created.length) await saveNewTenants(pool!, created);
    if (tenantLock) {
      // A failed request (4xx/5xx) must not leave half-applied company data behind: discard its
      // changes; the next request reloads this company's data from the database.
      if (res.statusCode >= 400) await rollbackTenantLock(tenantLock);
      else await commitTenantLock(tenantLock);
    }
  };

  // Save before the response leaves the server, so a 2xx means the data is durable.
  const originalJson = res.json.bind(res);
  let flushed = false;
  res.json = ((payload: unknown) => {
    if (flushed) return originalJson(payload);
    flushed = true;
    saveAll()
      .then(() => originalJson(payload))
      .catch(async (err) => {
        logger.error('Persistence: save failed', { error: err instanceof Error ? err.message : String(err), path });
        if (tenantLock) await rollbackTenantLock(tenantLock);
        res.status(500);
        originalJson({ error: 'PERSISTENCE_FAILED', message: 'تعذر حفظ البيانات في قاعدة البيانات. لم يتم تنفيذ العملية.' });
      });
    return res;
  }) as Response['json'];

  // Non-JSON responses (files, redirects): save after sending, best effort.
  res.on('finish', () => {
    if (flushed) return;
    flushed = true;
    saveAll().catch(async (err) => {
      logger.error('Persistence: post-response save failed', { error: err instanceof Error ? err.message : String(err), path });
      if (tenantLock) await rollbackTenantLock(tenantLock);
    });
  });
  // Client went away before a response: never keep the company lock.
  res.on('close', () => {
    if (!flushed && tenantLock) {
      flushed = true;
      rollbackTenantLock(tenantLock).catch(() => undefined);
    }
  });

  next();
}

/** Test helper: forget everything this module knows (simulates a fresh process). */
export function __resetIdentityPersistenceForTests(): void {
  known.clear();
  ephemeral.clear();
  initialised = false;
  readyPromise = null;
}
