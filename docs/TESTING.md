# Testing

Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run db:verify`, and `npm run test:e2e` for Phase 00. Vitest tests environment validation, correlation IDs, log-field redaction, and system schema names. The database verification starts a scratch PostgreSQL 17.10 cluster, migrates up, seeds system defaults twice, checks a database tax constraint, migrates down, then migrates and seeds again. It never uses production data. The CI workflow runs migration up/down/up against its separate PostgreSQL service.

Playwright covers every foundation page, both directions, persisted language choice, 1440px desktop, 768px tablet, and 375px mobile with a no-overflow assertion. Screenshots are reviewed separately for visual quality. Later financial tests must use deterministic decimal values, tenant-paired fixtures, idempotency checks, ledger assertions, and isolated test databases per `skills/testing-standards/SKILL.md`.

Phase 00 local final results: 6 Vitest tests and 10 Playwright Chromium tests passed. The scratch verifier also checks the positive database readiness path. Playwright uses a dedicated port and does not reuse a server across builds. GitHub Actions run [35372239368](https://github.com/Waledbadr/01erp/actions/runs/35372239368) passed on codex/phase-00-foundation at fcf0929, including migrations, typecheck, lint, Vitest, build, and Playwright.

The final lockfile passed npm ci with an engine override on local Node 23, and npm audit found zero vulnerabilities. CI remains configured for supported Node 22. Avoid launching the embedded PostgreSQL verifier concurrently with Vitest on resource-constrained Windows machines; all six tests passed when run sequentially.
