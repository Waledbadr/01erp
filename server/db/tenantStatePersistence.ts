/**
 * Company data persistence (TASK-008).
 *
 * Every company's operational data — chart of accounts, journals, items, stock, customers,
 * suppliers, sales, purchasing, treasury, VAT, ZATCA, POS, assets, documents, automation … —
 * is saved in PostgreSQL as ONE versioned snapshot per company (`tenant_state`).
 *
 * Per API request of a signed-in user (only when env.PERSISTENCE_ENABLED):
 *   1. BEGIN; lock the company's `tenant_state` row (SELECT … FOR UPDATE). Requests of the same
 *      company are therefore serialised across all server instances.
 *   2. If the stored version differs from the version this process holds, the company's slice
 *      of every store is replaced from the snapshot.
 *   3. The unchanged route handler runs.
 *   4. Before the response is sent: if the company's data changed, the new snapshot is written
 *      with version + 1; COMMIT. Failure → HTTP 500 and nothing is committed.
 *
 * Companies created during the request (registration) get their first snapshot afterwards.
 *
 * This is a whole-company snapshot, not a relational model: fine for pilot-sized companies,
 * last step before per-module tables (see docs/development/tasks/TASK-008.md).
 */
import crypto from 'crypto';
import type pg from 'pg';
import { centralStore } from '../core/tenantGuard.js';
import { logger } from '../core/logger.js';
import { getTenantStateRegistrations, type TenantStateContainer } from './tenantStateRegistry.js';

// ------------------------------------------------------------------
// Which central-store fields are company data
// ------------------------------------------------------------------
/** Identity data (saved by identityPersistence) and process-local bookkeeping. */
const CENTRAL_EXCLUDED = new Set([
  'tenants',
  'branches',
  'users',
  'userByEmail',
  'memberships',
  'sessions',
  'invites',
  'loginHistory',
  'passwordResetTokens',
  'sequenceLocks',
  'failedAttempts',
]);

/** Central-store maps keyed by a child id instead of the tenant id. */
function centralOwners(field: string, tenantId: string): Set<string> | null {
  const s = centralStore as unknown as Record<string, Map<string, { id: string }[]>>;
  const ids = (...fields: string[]) =>
    new Set(fields.flatMap((f) => (s[f]?.get(tenantId) || []).map((x) => x.id)));
  switch (field) {
    case 'journalLines':
      return ids('journals');
    case 'itemPriceHistory':
      return ids('items');
    case 'partyAttachments':
      return ids('customers', 'suppliers');
    case 'partyContracts':
    case 'supplierPriceHistory':
      return ids('suppliers');
    default:
      return null;
  }
}

interface Container {
  name: string;
  get: () => TenantStateContainer | undefined;
  create: (kind: 'map' | 'array') => TenantStateContainer;
  owners?: (tenantId: string) => Set<string> | null;
  afterLoad?: (tenantId: string) => void;
}

function containers(): Container[] {
  const out: Container[] = [];
  const store = centralStore as unknown as Record<string, unknown>;
  for (const field of Object.keys(store)) {
    if (CENTRAL_EXCLUDED.has(field)) continue;
    const v = store[field];
    if (!(v instanceof Map) && !Array.isArray(v)) continue;
    out.push({
      name: `central.${field}`,
      get: () => store[field] as TenantStateContainer,
      create: (kind) => (store[field] = kind === 'map' ? new Map() : []) as TenantStateContainer,
      owners: (t) => centralOwners(field, t),
    });
  }
  for (const r of getTenantStateRegistrations()) {
    out.push({ name: r.name, get: () => r.container, create: () => r.container, owners: r.owners, afterLoad: r.afterLoad });
  }
  return out;
}

/** Fields that did not exist yet when a snapshot is applied (created lazily by modules). */
function containerFor(name: string, kind: 'map' | 'array'): Container | null {
  const found = containers().find((c) => c.name === name);
  if (found) return found;
  if (name.startsWith('central.')) {
    const field = name.slice('central.'.length);
    if (CENTRAL_EXCLUDED.has(field)) return null;
    const store = centralStore as unknown as Record<string, unknown>;
    store[field] = kind === 'map' ? new Map() : [];
    return containers().find((c) => c.name === name) || null;
  }
  return null; // module store no longer registered: ignore
}

// ------------------------------------------------------------------
// Slice extraction
// ------------------------------------------------------------------
function belongs(key: unknown, value: unknown, tenantId: string, owners: Set<string> | null): boolean {
  if (typeof key === 'string' && (key === tenantId || key.startsWith(`${tenantId}:`))) return true;
  if (owners && typeof key === 'string' && owners.has(key)) return true;
  const v = value as { tenantId?: unknown } | unknown[] | null;
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) {
      const first = v[0] as { tenantId?: unknown } | undefined;
      return !!first && typeof first === 'object' && first.tenantId === tenantId;
    }
    return (v as { tenantId?: unknown }).tenantId === tenantId;
  }
  return false;
}

type Slice = { kind: 'map'; entries: [unknown, unknown][] } | { kind: 'array'; items: unknown[] };

function extract(c: Container, tenantId: string): Slice | null {
  const container = c.get();
  if (!container) return null;
  if (container instanceof Map) {
    const owners = c.owners?.(tenantId) ?? null;
    const entries = [...container.entries()].filter(([k, v]) => belongs(k, v, tenantId, owners));
    return { kind: 'map', entries };
  }
  const items = container.filter((x) => !!x && typeof x === 'object' && (x as { tenantId?: unknown }).tenantId === tenantId);
  return { kind: 'array', items };
}

function removeSlice(c: Container, tenantId: string): void {
  const container = c.get();
  if (!container) return;
  if (container instanceof Map) {
    const owners = c.owners?.(tenantId) ?? null;
    for (const [k, v] of [...container.entries()]) if (belongs(k, v, tenantId, owners)) container.delete(k);
  } else {
    for (let i = container.length - 1; i >= 0; i--) {
      const x = container[i] as { tenantId?: unknown } | null;
      if (x && typeof x === 'object' && x.tenantId === tenantId) container.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------
// Encoding (bigint, Map, Set, Date, Buffer survive JSON)
// ------------------------------------------------------------------
function encode(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  }
  if (seen.has(value)) throw new Error('Company data contains a circular reference and cannot be saved');
  seen.add(value);
  try {
    if (value instanceof Date) return { $date: value.toISOString() };
    if (Buffer.isBuffer(value)) return { $b64: value.toString('base64') };
    if (value instanceof Map) return { $map: [...value.entries()].map(([k, v]) => [encode(k, seen), encode(v, seen)]) };
    if (value instanceof Set) return { $set: [...value].map((v) => encode(v, seen)) };
    if (Array.isArray(value)) return value.map((v) => encode(v, seen) ?? null);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const e = encode(v, seen);
      if (e !== undefined) out[k] = e;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function decode(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    if (keys[0] === '$bigint') return BigInt(o.$bigint as string);
    if (keys[0] === '$date') return new Date(o.$date as string);
    if (keys[0] === '$b64') return Buffer.from(o.$b64 as string, 'base64');
    if (keys[0] === '$map') return new Map((o.$map as [unknown, unknown][]).map(([k, v]) => [decode(k), decode(v)]));
    if (keys[0] === '$set') return new Set((o.$set as unknown[]).map(decode));
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = decode(o[k]);
  return out;
}

interface Snapshot {
  format: 1;
  containers: Record<string, { kind: 'map'; entries: unknown } | { kind: 'array'; items: unknown }>;
}

export function buildSnapshot(tenantId: string): { json: string; hash: string } {
  const snap: Snapshot = { format: 1, containers: {} };
  for (const c of containers()) {
    const slice = extract(c, tenantId);
    if (!slice) continue;
    if (slice.kind === 'map' && slice.entries.length === 0) continue;
    if (slice.kind === 'array' && slice.items.length === 0) continue;
    snap.containers[c.name] =
      slice.kind === 'map'
        ? { kind: 'map', entries: encode(slice.entries) }
        : { kind: 'array', items: encode(slice.items) };
  }
  const json = JSON.stringify(snap);
  return { json, hash: crypto.createHash('sha256').update(json).digest('hex') };
}

export function applySnapshot(tenantId: string, snap: Snapshot): void {
  // 1. Remove this company's data from every known store.
  for (const c of containers()) removeSlice(c, tenantId);
  // 2. Insert the snapshot.
  const loaded: Container[] = [];
  for (const [name, part] of Object.entries(snap.containers || {})) {
    const c = containerFor(name, part.kind);
    if (!c) continue;
    let container = c.get();
    if (!container) container = c.create(part.kind);
    if (part.kind === 'map' && container instanceof Map) {
      for (const [k, v] of decode(part.entries) as [unknown, unknown][]) container.set(k, v);
    } else if (part.kind === 'array' && Array.isArray(container)) {
      container.push(...(decode(part.items) as unknown[]));
    }
    loaded.push(c);
  }
  for (const c of containers()) c.afterLoad?.(tenantId);
}

// ------------------------------------------------------------------
// Locking, loading and saving
// ------------------------------------------------------------------
/** Version of each company's data currently held by this process. */
const memVersion = new Map<string, number>();
/** Hash of the snapshot last written or loaded by this process. */
const memHash = new Map<string, string>();

export interface TenantLock {
  tenantId: string;
  client: pg.PoolClient;
  released: boolean;
  releaseLocal: () => void;
}

/**
 * In-process queue per company. Requests of the same company wait here WITHOUT holding a
 * database connection, so a burst of parallel requests (a dashboard loads ~8 at once) cannot
 * exhaust the pool while they wait for the row lock.
 */
const localQueues = new Map<string, Promise<void>>();
function enterLocalQueue(tenantId: string): Promise<() => void> {
  const previous = localQueues.get(tenantId) || Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const chained = previous.then(() => mine);
  localQueues.set(tenantId, chained);
  return previous.then(() => () => {
    release();
    if (localQueues.get(tenantId) === chained) localQueues.delete(tenantId);
  });
}

/**
 * Starts a transaction holding the company's row lock and makes sure this process holds the
 * latest version of the company's data. The caller must finish with commitTenantLock or
 * rollbackTenantLock.
 */
export async function acquireTenantLock(pool: pg.Pool, tenantId: string): Promise<TenantLock> {
  const releaseLocal = await enterLocalQueue(tenantId);
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    releaseLocal();
    throw err;
  }
  const lock: TenantLock = { tenantId, client, released: false, releaseLocal };
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '20s'`);
    await client.query(
      `INSERT INTO tenant_state (tenant_id, version, data) VALUES ($1, 0, NULL) ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    const r = await client.query<{ version: string; has_data: boolean }>(
      'SELECT version, data IS NOT NULL AS has_data FROM tenant_state WHERE tenant_id = $1 FOR UPDATE',
      [tenantId],
    );
    const version = Number(r.rows[0].version);
    if (memVersion.get(tenantId) !== version) {
      if (r.rows[0].has_data) {
        const d = await client.query<{ data: Snapshot }>('SELECT data FROM tenant_state WHERE tenant_id = $1', [tenantId]);
        applySnapshot(tenantId, d.rows[0].data);
        memHash.set(tenantId, buildSnapshot(tenantId).hash);
      } else {
        memHash.delete(tenantId); // nothing stored yet: current memory (defaults) will be saved
      }
      memVersion.set(tenantId, version);
    }
    return lock;
  } catch (err) {
    await rollbackTenantLock(lock);
    throw err;
  }
}

/** Saves the company's data if it changed, then commits and releases the lock. */
export async function commitTenantLock(lock: TenantLock): Promise<void> {
  if (lock.released) return;
  try {
    const { json, hash } = buildSnapshot(lock.tenantId);
    if (memHash.get(lock.tenantId) !== hash) {
      const r = await lock.client.query<{ version: string }>(
        `UPDATE tenant_state SET data = $2::jsonb, version = version + 1, updated_at = NOW()
         WHERE tenant_id = $1 RETURNING version`,
        [lock.tenantId, json],
      );
      await lock.client.query('COMMIT');
      memVersion.set(lock.tenantId, Number(r.rows[0].version));
      memHash.set(lock.tenantId, hash);
    } else {
      await lock.client.query('COMMIT');
    }
  } catch (err) {
    await lock.client.query('ROLLBACK').catch(() => undefined);
    // Memory may now be ahead of the database: force a reload on the next request.
    memVersion.delete(lock.tenantId);
    throw err;
  } finally {
    lock.released = true;
    lock.client.release();
    lock.releaseLocal();
  }
}

export async function rollbackTenantLock(lock: TenantLock): Promise<void> {
  if (lock.released) return;
  lock.released = true;
  await lock.client.query('ROLLBACK').catch(() => undefined);
  lock.client.release();
  lock.releaseLocal();
  memVersion.delete(lock.tenantId); // memory may hold uncommitted changes
}

/** First snapshot for companies created during this request (e.g. registration). */
export async function saveNewTenants(pool: pg.Pool, tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    if (memVersion.has(tenantId)) continue;
    const { json, hash } = buildSnapshot(tenantId);
    const r = await pool.query<{ version: string }>(
      `INSERT INTO tenant_state (tenant_id, version, data) VALUES ($1, 1, $2::jsonb)
       ON CONFLICT (tenant_id) DO NOTHING RETURNING version`,
      [tenantId, json],
    );
    if (r.rows.length) {
      memVersion.set(tenantId, 1);
      memHash.set(tenantId, hash);
    } else {
      logger.warn('Company data snapshot already existed for a new company; it will be reloaded', { tenantId });
    }
  }
}

/** Test helper: forget what this process knows about stored company data. */
export function __resetTenantStateForTests(): void {
  memVersion.clear();
  memHash.clear();
}
