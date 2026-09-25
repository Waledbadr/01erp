# سحاب ERP — Sahab ERP

نظام سحابي للمحاسبة والمخزون والمبيعات والمشتريات والفوترة الإلكترونية للمنشآت في السعودية.
Cloud accounting, inventory, sales, purchasing and e-invoicing for Saudi businesses (Arabic-first, English supported).

## Current state (September 2026)

| Area | State |
|---|---|
| Users, companies, branches, memberships, sessions | Stored in PostgreSQL when `DATABASE_URL` is set (tested across restarts) |
| Accounting, inventory, sales, purchasing, treasury, VAT, ZATCA, reports… | Working screens, **data still kept in server memory** — lost on restart |
| ZATCA | Invoice XML / hash / QR generated locally; no onboarding with ZATCA's portal yet |

Do not use it for real bookkeeping until the remaining modules are persisted. Details:
`docs/development/tasks/TASK-006.md`.

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
