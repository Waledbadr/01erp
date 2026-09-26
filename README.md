# سحاب ERP — Sahab ERP

نظام سحابي للمحاسبة والمخزون والمبيعات والمشتريات والفوترة الإلكترونية للمنشآت في السعودية.
Cloud accounting, inventory, sales, purchasing and e-invoicing for Saudi businesses (Arabic-first, English supported).

## Current state (September 2026)

| Area | State |
|---|---|
| Users, companies, branches, memberships, sessions | PostgreSQL tables (`docs/development/tasks/TASK-006.md`) |
| All company data: accounts, journals, items, stock, customers, suppliers, sales, purchasing, treasury, VAT, ZATCA, POS, assets… | PostgreSQL, one versioned snapshot per company (`docs/development/tasks/TASK-008.md`) |
| ZATCA | Invoice XML / hash / QR generated locally; no onboarding with ZATCA's portal yet |

Suitable for a pilot with real data. Known accounting issues and limits are listed in TASK-008.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000 (in-memory, demo company + demo accounts)
```

With PostgreSQL:

```bash
DATABASE_URL=postgresql://... npm run db:migrate   # creates tables; optional PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD
DATABASE_URL=postgresql://... npm run dev
```

All environment variables are described in `.env.example`.

## Checks

```bash
npm run typecheck
npm test                                                   # unit + integration suites
TEST_DATABASE_URL=<disposable db> npm run test:persistence # restart / multi-process test (WIPES that database)
npm run build
```

## Layout

| Path | Contents |
|---|---|
| `src/` | React front-end (views in `src/components/views`) |
| `server/` | Express API, business modules (`server/modules`), database (`server/db`) |
| `api/` | Vercel serverless entry |
| `docs/` | Product and technical documentation (architecture, accounting rules, VAT/ZATCA, security, user guides) |
| `docs/development/` | Build history: phase prompts, phase status, task records |
| `skills/` | Instructions for AI coding agents |
