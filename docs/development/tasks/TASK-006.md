# TASK-006: Persist identity data (users, companies, sessions) in PostgreSQL — Unit 1

Status: DONE locally; not pushed, not deployed (2026-09-25)

## Problem (verified in code before this task)

- Every record lived only in `CentralTenantDataStore` (`server/core/tenantGuard.ts`, `new Map()`).
  `server/db/client.ts` / `schema.ts` were never imported by any route or service; zero SQL queries ran.
- `server/db/migrate.ts` created only a version table; no application table existed.
- On Vercel each cold start began with empty memory and each instance had its own memory:
  registered users, companies and sessions disappeared.
- `authenticateRequest` (used by `/billing`) fabricated an OWNER context for any unauthenticated
  request using the `x-tenant-id` header, and SUPER_ADMIN with `x-superadmin: true`.
- A platform super admin with a published password (`superadmin@saudi-erp.com`) was seeded on every start.

## Scope of this unit

Persisted: tenants (companies), branches, users, tenant memberships, sessions (token stored only as
SHA-256), user invites, password-reset / MFA-challenge tokens, login history.

NOT persisted yet (still in memory, lost on restart): chart of accounts changes, journals, items,
stock, sales, purchases, treasury, VAT, ZATCA, assets, documents, automation, audit log, billing,
custom roles. A company loaded from the database gets its default scaffolding rebuilt
(`initializeTenantDefaults`), so it is usable, but its operational data starts empty after a restart.

## Changes

- `server/db/migrations.ts`: versioned SQL migrations with an advisory lock; migration
  `002_identity_tenants_sessions`. Applied automatically on the first API request when a database is
  configured, or with `npm run db:migrate`.
- `server/db/identityPersistence.ts`: per request, loads the needed records from PostgreSQL
  (authoritative), runs the unchanged handlers, and writes all changed identity records in one
  transaction before the JSON response is sent. Failure → HTTP 500 and unsaved new records are removed
  from memory. Load failure → HTTP 503.
- `server/core/tenantGuard.ts`: `createTenant` split; new `initializeTenantDefaults`; optional
  pre-reserved `code` (from `tenant_code_seq`). Demo seed only when `env.SEED_DEMO_DATA`.
- `server/core/env.ts`: `PERSISTENCE_ENABLED`, `SEED_DEMO_DATA` (`ERP_PERSISTENCE`, `SEED_DEMO_DATA`).
- `server/core/authMiddleware.ts`: `authenticateRequest` now returns 401 without a real session/API key.
- `server/db/migrate.ts`: real migrations + optional platform admin from
  `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`.
- `server/app.ts`: mounts `identityPersistenceMiddleware` after body parsers, before `authMiddleware`.
- `server/modules/auth/routes.ts`: register / create-company pass the reserved tenant code.
- Test: `src/__tests__/persistence_identity.test.ts` + `scripts/test-api-server.ts`; CI gets a
  PostgreSQL 16 service and `TEST_DATABASE_URL`.

Behaviour without `DATABASE_URL` is unchanged (in-memory, demo seed on).

## Acceptance evidence (local, PostgreSQL 16, Node 22)

- `npm run test:persistence` with `TEST_DATABASE_URL`: 9/9 passed, twice. The API runs as separate
  processes that are killed with SIGKILL between steps:
  register → hard restart → same session token valid, login works, chart of accounts present;
  invite on process A → login on process B; logout on B → token rejected on A;
  terminate-others on a fresh process revokes a session it never saw; unique TNT codes;
  no demo super admin; unauthenticated billing call with `x-tenant-id`/`x-superadmin` → 401;
  raw session token absent from the database.
- Negative control: same test with persistence forced off → 7 of 9 fail (the 2 that pass do not
  depend on persistence).
- Full suite: 322/323. The single failure (`accounting.test.ts`, Arabic SAR symbol `﷼` vs `ر.س`)
  already failed before this task; it depends on the Node/ICU version.
- `npm run typecheck`, `npm run build`, `npm run test:api-esm`: passed.
- `npm run db:migrate`: applies 001+002 on an empty database, is idempotent on re-run, creates the
  platform admin; that admin can log in.

## Known limitations (honest)

- Per request, the store's identity collections are scanned to detect changes: fine for hundreds of
  users/sessions, needs replacing by explicit repository writes as data grows.
- Each authenticated request makes several small queries (session, user, memberships, companies).
- Concurrent edits of the same record on two instances: last write wins.
- Rate-limit / lockout counters remain per process.
- The Drizzle definitions in `server/db/schema.ts` for `tenants`, `branches`, `users` do not match the
  real tables created by migration 002; `schema.ts` is still unused and must be reconciled in a later unit.
- If Vercel already has `DATABASE_URL`/`POSTGRES_URL` set, deploying this turns persistence on and the
  demo accounts off. Set `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` and run `npm run db:migrate`
  to get a platform admin.

## Addendum (same day): lock down tables exposed by Supabase

The deployment database is Supabase, which exposes the `public` schema over HTTP to the `anon` and
`authenticated` roles (their keys are public). Tables created by migration 002 were readable there,
including password hashes. Migration `003_lock_down_identity_tables` enables Row Level Security with no
policies on every ERP table and revokes all privileges from `anon` / `authenticated` (when those roles
exist). The application connects as the table owner and is not affected.
Evidence: new test "public API roles ... cannot read or write identity tables" (RLS flag, privileges,
and `SET ROLE anon` → permission denied); it fails when migration 003 is disabled. Suite: 10/10.
