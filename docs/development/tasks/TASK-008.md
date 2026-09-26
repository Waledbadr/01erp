# TASK-008: Persist all company data in PostgreSQL (company snapshots)

Status: DONE (2026-09-25)

## Goal

Let the owner use the application with real data: everything a company enters (chart of
accounts, journals, items, stock, customers, suppliers, sales, purchasing, treasury, VAT, ZATCA,
POS, fixed assets, documents, notifications, automation, API keys, webhooks …) must survive
restarts and be identical on every Vercel instance.

## Approach (and why)

The code keeps ~60 in-memory stores across 20 modules, all read and written synchronously.
Moving each to relational tables is the long-term target but is weeks of work. This task stores
**one versioned JSON snapshot per company** (`tenant_state`) and keeps the handlers unchanged:

1. Per signed-in API request: `BEGIN`, lock the company's row (`SELECT … FOR UPDATE`). All requests
   of one company are serialised across instances; within a process they queue in memory first
   so a burst of parallel requests cannot exhaust the connection pool.
2. If the stored version differs from the version the process holds, the company's slice of every
   store is replaced from the snapshot.
3. The handler runs.
4. Before the response: if the request succeeded (< 400) and the data changed, the snapshot is
   written with `version + 1` and committed. If the request failed (≥ 400), the changes are
   discarded and the next request reloads the company from the database, so a failed operation
   never leaves half-applied data (this fixed a real case: a failing opening-stock request used to
   add the stock anyway).

Stores are discovered automatically: every Map/array field of `centralStore` except identity data,
plus module stores registered through `server/db/tenantStateRegistry.ts`. A company's slice is found
by key (`tenantId`, `tenantId:…`), by `value.tenantId`, or by owner ids (e.g. lines keyed by journal id).
The encoding preserves `bigint`, `Map`, `Set`, `Date`, `Buffer`.

Also in this task:
- Modules no longer inject fake data into real companies (sample fixed assets, due invoices and
  communication logs in collections, sample notifications, automatic backup on page open) unless
  `SEED_DEMO_DATA` is on.
- Service validation errors now return 400/404/409/403 instead of 500.
- Migration `005_tenant_state` (RLS on, public API roles revoked).

## Evidence

`src/__tests__/persistence_company_data.test.ts` against real PostgreSQL, API run as separate
processes killed with SIGKILL:
- full sale on process A (item, customer, opening stock 50, posted invoice) → after restart on
  process B: item, customer, POSTED invoice (230.00), stock 48, journals, balanced trial balance;
- failed opening-stock request → stock still 48 in the same process and after restart;
- 10 concurrent customer creations split over two processes → both see all 10, codes unique;
- 25 parallel requests for one company on one process → all 200, < 15 s;
- second company sees none of the first company's data and has no demo assets;
- one snapshot row per company, RLS enabled.

Negative controls: without the discard-on-failure rule the failed-request test reads stock 98
(the original bug); with company persistence disabled 4 of 6 tests fail.

Full suite 338/338, `npm run build`, `npm run test:api-esm` pass. All 22 business pages opened in a
browser against PostgreSQL with a new company: no crash, no page error, no failed API call.

## Limitations (honest)

- Each save rewrites the whole company snapshot: fine for pilot-sized companies (tens of MB would
  be slow); per-module relational tables remain the target, starting with the ledger.
- Requests of the same company are serialised (one at a time across all instances).
- Only the signed-in company (and companies created in the request) are saved. A platform-admin
  action that changes another company's module data is not saved.
- Not persisted: in-app backups (use the database provider's backups), uploaded OCR files, API rate
  limit counters, POS push subscriptions.
- Accounting issues seen while testing, not caused by persistence and still open: journal numbers
  repeat (`JV-2026-00001` twice), the opening-stock journal does not appear in the journals list,
  and the demo data VAT ledger does not match the general ledger.
