---
name: testing-standards
description: Write deterministic accounting, inventory, API, security, and workflow tests for this ERP.
---

# Testing standards

Place focused unit tests near domain code and integration/API tests under tests with isolated fixtures. Factories create deterministic tenant, user, chart, item, party, and document records; never use production data or random monetary values. Use exact decimal strings and fixed UTC dates. A journal helper creates a command, posts it, and asserts account lines, total debit = credit, source link, immutability, and retry idempotency. VAT helpers assert per-line half-up values and document sums. For every financial command, test duplicate key and rollback on failure. For every company-owned endpoint, create two tenants and assert cross-tenant reads/writes are denied. Playwright covers workflows in ar/RTL and en/LTR at mobile and desktop widths.
