# Architecture

## Delivered foundation

A single Next.js 16 App Router application uses strict TypeScript, React, Tailwind 4, Drizzle, node-postgres, and PostgreSQL. The project is a modular monolith. `src/app` holds UI and HTTP routes, `src/components` reusable interface pieces, `src/i18n` Arabic and English resources, `src/db` the Drizzle schema and lazy connection pool, and `src/server` domain modules. Later-phase modules have no business routes yet. API route handlers will delegate to server modules rather than placing financial rules in UI code.

Phase 00 routes are the home, login, registration, password recovery, maintenance, 404 and error boundaries, and two public health endpoints. Authentication pages are informational shells until Phase 01; they contain no misleading forms. The desktop sidebar collapses; a mobile bottom bar links to real routes. A notification slot and company/branch context slots carry translated explanations until account setup. The service status card calls the real readiness endpoint.

## Data and integrity

Drizzle owns `src/db/schema.ts` and generated SQL in `drizzle/`. The initial migration creates only global system-default tables: roles, units, tax rates, document types, and a Saudi chart template, plus a migration audit table. A reversible down SQL file accompanies the generated migration. `scripts/migrate.ts` applies versioned SQL transactionally with `app_schema_migrations`; `scripts/rollback.ts` is restricted to the test environment. The seed uses conflict-safe inserts and contains no business entities. The database enforces unique codes and a valid tax-rate range.

The readiness endpoint runs `SELECT 1` and returns HTTP 503 when PostgreSQL is unavailable. The liveness endpoint reports process availability. Database connections are opened lazily so static foundation pages can render even when a development database is absent. Production/staging startup validates the environment and database URL before launching.

## Security and future boundaries

Future financial commands will derive tenant context from verified membership, enforce permissions in server modules, accept idempotency keys, lock rows, and commit source document, inventory and immutable balanced journal in one PostgreSQL transaction. PostgreSQL constraints and deferred triggers will defend ledger integrity. Corrections use reversal entries. A transactional outbox will separate external delivery from accounting commits. Object storage will hold documents, not financial state.

Amounts and quantities will use exact decimal values. Arabic RTL is the default; English LTR switches instantly through resources and logical CSS properties. The current language choice persists locally until user preferences exist in Phase 01. All existing pages render without database access. Deployment environments receive separate databases and secrets, with `APP_ENV` validation and environment-specific local files for scripts.

## Risks and limits

Phase 00 is an application foundation, not an operational ERP. Multi-tenant authorization, financial posting, stock valuation, ZATCA, delivery queues, backup services, and subscriptions remain assigned to later phases. Hosting must support reliable PostgreSQL transactions. Cloudflare CDN, R2, Queues, and Turnstile may be added where they do not weaken those guarantees.
