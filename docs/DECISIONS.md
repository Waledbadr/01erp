# Decisions

## 2026-09-17 — Modular monolith

Keep one Next.js application with domain modules. Accounting and inventory will be able to commit in one PostgreSQL transaction. Extracting a service later requires a data and event migration plan.

## 2026-09-17 — Drizzle and PostgreSQL

Use Drizzle with managed PostgreSQL and the Node runtime. SQL-oriented migrations, explicit constraints, deferred triggers, and row locks fit the ledger contract. Do not change ORM without a documented migration plan.

## 2026-09-17 — npm single package

Use npm with a committed lockfile and one application package. A monorepo adds no value at this stage. CI uses `npm ci` and supported Node 22. Local Node 23 is outside the declared supported range because an ESLint dependency rejects it; installation on this machine required an engine-check override. Production and CI must use a supported version.

## 2026-09-17 — Migration safety

Generate SQL with Drizzle Kit, review it, and commit a matching down SQL file. Apply each migration in a transaction with an application migration ledger. Permit rollback only under `APP_ENV=test`; production schema changes require a reviewed forward migration. System defaults are idempotent and never include sample customers or transactions.

## 2026-09-17 — Health and startup

Serve liveness without a database. Readiness makes a real database query and returns 503 on failure. Static Phase 00 pages render during development without PostgreSQL; staging and production start fails if required database configuration is absent.

## 2026-09-17 — Phase boundary

Login, registration, and account recovery routes contain truthful informational shells without entry forms because identity and authorization belong to Phase 01. Notification and company/branch slots are descriptive, not inert buttons. The status card displays the real readiness result.

## 2026-09-17 — Locale storage

Use a client external store backed by localStorage for immediate Arabic/English switching without hydration mismatch. Update HTML `lang`, `dir`, and title. Persist per user account in Phase 01.

## 2026-09-17 — Scratch PostgreSQL

A PostgreSQL 18 embedded distribution crashed during Windows `initdb`. Use the PostgreSQL 17.10 binary from `embedded-postgres` for local migration verification, with `--locale=C` and a free localhost port. CI uses a PostgreSQL 17 service. No production database is touched.

## 2026-09-17 — Transactional outbox

Record external delivery intents alongside source documents in the same transaction in later phases. Workers retry with delivery logs. Provider failure must not roll back an already committed financial transaction.

## 2026-09-17 — Task convention

Superpowers workflow is unavailable in this environment. Record each implementation task with acceptance criteria and verification in `tasks/TASK-<n>.md`.

## 2026-09-17 — Deterministic E2E server

Playwright starts its own production server on port 3101 and never reuses an existing process. Reusing a server after a new build served mismatched JavaScript chunks and left client hydration incomplete. Tests wait for an explicit hydration marker before switching language.

## 2026-09-17 — CI evidence gate

The isolated codex/phase-00-foundation branch is linked to GitHub. Actions run 35372239368 passed at fcf0929 with Node 22, PostgreSQL 17, migrations, tests, and build. The recorded remote result closes the Phase 00 CI evidence gate; local results alone were not used to claim CI success.

## 2026-09-17 — Development dependency security

Vitest 4.1.11 replaces the vulnerable 3.x mocker chain. An npm esbuild override pins 0.28.2 because Drizzle Kit still brings an older esbuild through its loader. Drizzle migration generation and the full local verification suite passed with the override; npm audit reports zero vulnerabilities. Keep the override under review when Drizzle Kit updates its dependency chain.
