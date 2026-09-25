# 01 — PHASE 00: FOUNDATION, SKILLS & TOOLING SETUP

Read the Master Prompt (00-MASTER-SYSTEM-PROMPT.md) first. This phase has THREE mandatory parts, in strict order: A) Tooling & Skills Setup, B) Project Scaffold, C) Base Infrastructure. Do not skip A — every later phase depends on it.

---

## A) SKILLS & TOOLING SETUP (MANDATORY FIRST TASK)

Your first job is to install and configure everything that makes subsequent phases faster and higher-quality. Execute ALL of the following:

### A1. Agent Skills — Install

Install and verify the following skills/tools for your environment:

- **Superpowers workflow** (task decomposition + verification loops) if available for your agent; otherwise implement an equivalent in-repo convention: every task gets written to `tasks/TASK-<n>.md` with acceptance criteria before coding, and marked done only after its test passes.
- **Context7 MCP** (up-to-date library documentation retrieval) — configure it.
- **Playwright MCP** (browser automation for E2E verification) — configure it.
- **PostgreSQL MCP** (direct schema/query inspection) — configure it if available; otherwise use `psql` via shell.

If any of the above is unavailable in this environment, document the limitation in PHASE_STATUS.md and proceed with the closest available equivalent. Never fake availability.

### A2. Project Skills — Create In-Repo (these persist across all future sessions)

Create `skills/` in the repository root with these skill files (each as `skills/<name>/SKILL.md`). They are project law — read the relevant one before working on the matching domain:

1. `skills/accounting-engine/SKILL.md` — The posting engine contract (G1/G2): journal shape, sourceType/sourceId/sourceKey idempotency, reversal-only corrections, DB-level balance enforcement, reversal journal pattern, period rules. Include a worked example journal for: cash sale, credit sale, receipt with allocation, sales return, purchase + landed cost, expense (cash and accrued).
2. `skills/inventory-engine/SKILL.md` — Movement model (source-mandatory), WAC algorithm with serialized row-lock update, unit conversion math (base-unit quantities), landed cost allocation methods, stocktake flow, negative-stock rules.
3. `skills/saudi-vat/SKILL.md` — Rates, inclusive/exclusive decomposition, line-level half-up 2dp rounding, tax snapshot rule, credit/debit note tax reversal, B2B vs B2C document types, ZATCA fields (UUID/hash/QR TLV basics).
4. `skills/tenant-security/SKILL.md` — Tenant guard pattern, permission matrix conventions, secrets handling, audit event requirements, file upload validation rules.
5. `skills/phase-exit-checklist/SKILL.md` — The exact checklist to run before declaring any phase complete (build, typecheck, lint, migrations, new tests, regression tests, route inventory with zero dead links, button audit with zero dead actions, RTL/LTR screenshots check, mobile viewport check, placeholder scan, PHASE_STATUS update).
6. `skills/testing-standards/SKILL.md` — Test layout, factories, fixed test data conventions (never random money values), journal assertion helpers (given/postJournal/expect balanced), VAT assertion helpers, idempotency test pattern, tenant-isolation test pattern.
7. `skills/design-system/SKILL.md` — UI conventions: component catalog, RTL rules (logical CSS properties only), mobile-first breakpoints, number/date/currency formatting per locale, empty/loading/error states, premium document styling rules.

### A3. Developer Tooling — Install & Configure

- TypeScript strict mode; ESLint + Prettier with husky/lint-staged (or equivalent pre-commit hooks).
- Test runner (Vitest for unit/integration + Playwright for E2E).
- Migration tooling per chosen ORM.
- i18n framework setup (ar/en resources, RTL/LTR direction switching).
- Seed framework limited to system defaults ONLY (default roles, units, tax rates, document types, Saudi default chart of accounts). NO fake business data anywhere.
- CI-ready scripts: `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed:system`.

### A4. Verification Before Continuing

Run every installed tool once (lint on a sample file, a trivial passing test, migration up/down on a scratch database). Record versions in PHASE_STATUS.md.

---

## B) PROJECT SCAFFOLD

1. Repository structure (your choice, but clean Modular Monolith): app (Next.js App Router), server modules (sales, purchasing, inventory, accounting, treasury, core), packages for shared UI and db client. Monorepo tooling only if it earns its complexity — otherwise a well-organized single app.
2. Next.js (App Router) + TypeScript + Tailwind + chosen ORM + PostgreSQL.
3. Environments: `.env.example` documenting EVERY environment variable; separate dev/test/staging/prod config loading; validation of required env vars at boot (fail fast with clear message).
4. Document the selected stack + rationale + risks in `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` (including the ORM decision per Master Prompt Part 11 — decide NOW).
5. Structured JSON logging with correlation IDs; never log secrets, tokens, passwords, or private keys.
6. Health endpoints: `/api/health/live`, `/api/health/ready` (checks DB).

---

## C) BASE INFRASTRUCTURE (UI + LAYOUT)

1. Base layout: Desktop sidebar + Mobile bottom navigation, collapsible, with notification bell slot and company/branch switcher slots (functional wiring comes in Phase 01).
2. Reusable UI component catalog per `skills/design-system/SKILL.md`: Button, Input, Select, DatePicker, Modal, Drawer, Toast, Table (with automatic Cards-on-mobile strategy), Tabs, Badge, EmptyState, Loading/Skeleton, ConfirmDialog (for dangerous operations), PageHeader, FilterBar.
3. i18n fully working: Arabic RTL default, English LTR, instant switch without logout, persisted per user preference; ALL strings from resources.
4. Design tokens: premium modern business theme; spacing/typography scale; formal document styling foundation.
5. Pages (routes) — shell only where function belongs to Phase 01, but every route must render without error: Login, Register, Forgot Password, Not Found, Error boundary, Maintenance. No dead routes.
6. Keyboard accessibility baseline; focus states; logical CSS properties only (no physical left/right) so RTL never breaks.
7. CI pipeline file (GitHub Actions or equivalent): typecheck, lint, unit tests on every push.

---

## DEFINITION OF DONE (Phase 00)

- [ ] A1–A4 fully executed; skills/ contains 7 complete SKILL.md files; tooling runs; versions recorded
- [ ] Scaffold builds; `npm run build`, `typecheck`, `lint` all pass with zero errors
- [ ] Migration up/down verified on a scratch database
- [ ] A trivial unit test AND a trivial Playwright test pass in CI
- [ ] Layout renders correctly at Desktop/Tablet/Mobile viewports in both RTL and LTR
- [ ] i18n switch works on every existing page
- [ ] All docs/ files from Master Prompt Part 14 exist (may be stubs except ARCHITECTURE and DECISIONS which must be substantive)
- [ ] Zero placeholders found by repo scan
- [ ] PHASE_STATUS.md updated: Phase 00 COMPLETE with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md) before declaring done.
