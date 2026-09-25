# TASK-007: Make the interface clear for business users

Status: DONE locally; not pushed, not deployed (2026-09-25)

## Problems found (by opening every page in a browser, signed in as the demo owner)

- Home page was a build-status page ("Phase 00 & 01 Certified", "PostgreSQL", "14/14 documents").
- One flat menu of 27 items mixing business modules with developer screens (design system, project
  docs, audit tools, phase roadmap) and links to login/register/maintenance pages.
- Login page showed the demo password and all demo accounts, pre-filled, and a "Cloudflare Turnstile
  SECURE" badge although Turnstile is not configured.
- Page titles and texts full of internal codes ("Rule G1", "(G4)", "Phase 13 Engine", "Phase 02: Active")
  and unverified claims ("ZATCA Compliant", "ZATCA Phase 2 Certified").
- Two product names (سحاب / سعودي ERP).
- Refreshing the browser always returned to the login page; the page was not in the URL.
- 8 screens (purchasing, treasury, VAT, ZATCA, security, subscription, platform admin, parts of others)
  sent API requests WITHOUT the session token → HTTP 401 → empty screens.
- Accounting screen crashed (journals API returns `entryNumber`/`descriptionAr`, screen expected
  `number`/`description`).
- VAT reconciliation API returned HTTP 500 (bigint + number).
- Treasury screen called two non-existent endpoints; inventory called a wrong low-stock URL.
- Sales list showed every non-POSTED invoice (including PAID) as "Draft".

## Changes

- Menu grouped: Home · Sales · Purchasing & Stock · Finance · Tools · Settings; platform-admin group only
  for platform admins; developer screens only in development builds (also blocked by route).
- New home page (`HomeDashboardView`): getting-started checklist, quick actions, sales this month,
  receivables, payables, cash, latest invoices, items to reorder — all from existing APIs, "—" when the
  role cannot read a figure.
- Login/register: demo accounts and sample-data button only when the server runs the demo seed
  (`GET /api/v1/auth/public-config`); no pre-filled credentials; Turnstile badge only when configured.
- One product name, "سحاب ERP / Sahab ERP" (`src/i18n/*.ts`).
- Page in the URL; refresh, back button and bookmarks work; stored session validated on load.
- `src/lib/installAuthFetch.ts`: every same-origin `/api/` request carries the session token.
- Fixes: accounting journal normalisation, VAT reconciliation bigint conversion, treasury and
  low-stock endpoint paths, sales status labels.
- Page titles match menu labels; internal rule/phase codes and unverified certification badges removed.
- Build files moved to `docs/development/` (phases, PHASE_STATUS, tasks, demo accounts); root README added.

## Verification

- Headless Chromium visited all 22 business pages signed in: no crash screen, no page error, no failed
  API call (the platform-admin page returns 403 for a non-admin, as intended, and is hidden from them).
  Only `/reminders` sends a POST on load (reminder *preview*).
- Refresh on `/inventory` stays on `/inventory` and signed in.
- `npm run typecheck`, full test suite, `npm run build`, `npm run test:api-esm` (see final report).

## Not done

- Screens were not redesigned individually; long forms and tables keep their original layout.
- No role-based hiding of menu items (the server still enforces permissions).
- Demo data inconsistency seen on the VAT page (tax ledger vs general ledger) is left for the accounting unit.
