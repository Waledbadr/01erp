# Phase status

Reviewed 2026-09-18. **Phase 00 = IN PROGRESS (local verification PASS; remote CI NOT VERIFIED).** Phases 01–15 = NOT STARTED. Deployment status: not deployed; no staging or production credentials or host have been supplied.

## Phase 00 delivered

- A1–A4: Seven in-repo skills; task convention; configured TypeScript, ESLint, Prettier, Husky/lint-staged, Vitest, Playwright CLI, Drizzle Kit, environment files and validation, npm lockfile, and GitHub Actions workflow. Local Husky hook path and files were installed.
- B: Next.js App Router modular monolith with React, Tailwind, Drizzle, PostgreSQL/node-postgres, transactional migrations, idempotent system seed, structured allowlisted JSON logs, correlation IDs, liveness and real database readiness endpoints.
- C: Desktop collapsible sidebar, 375px mobile bottom navigation, translated company/branch/notification slots, Arabic RTL and English LTR with persistent instant switching; reusable component catalog and design tokens. Home, login, register, forgot-password, maintenance, 404, and error boundary render. Authentication routes are truthful shells until Phase 01; no authentication, financial, or inventory functionality is claimed.
- All thirteen Part 14 docs, AGENTS.md, architecture and decision rationale are present. See docs/PHASE_00_AUDIT.md for route, API, schema, and action inventory.

## Versions and commands

- Local Node 23.11.0 and npm 11.18.0. Node 23 is outside package.json's supported engine range; local npm installation required `--engine-strict=false`. CI selects Node 22. Production must use a supported Node version. No claim of local Node 22 execution is made.
- Installed from lockfile: Next.js 16.3.5, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3, Drizzle ORM 0.45.2, node-postgres 8.23.0, ESLint 9.39.5, Prettier 3.9.7, Vitest 4.1.11, Playwright 1.63.0, embedded PostgreSQL 17.10.0-beta.17 (server reports PostgreSQL 17.10). Lockfile version 3; final `npm ci --engine-strict=false` passed on local Node 23, and `npm audit` found zero vulnerabilities. The esbuild override pins the patched 0.28.2 toolchain.
- `npm run format:check`: pass, zero unformatted files. `npm run lint`: pass, zero errors. `npm run typecheck`: pass, zero errors. `npm run build`: pass, seven app/health routes plus Next not-found.
- `npm run test`: 6/6 new unit/integration tests, two files; 0 prior-phase regression tests. `npm run test:e2e`: 10/10 Chromium tests, including one new 375px scroll-navigation regression. No failing tests remain locally.
- `npm run db:verify`: pass on a fresh localhost PostgreSQL 17.10 scratch cluster. Migration up → seed → seed again → down → up → seed, negative-tax DB constraint rejection, six-role count/idempotency, and positive readiness query all verified. Scratch DB uses no real business data.
- RTL/LTR: six screenshot cases visually reviewed at 1440px desktop, 768px tablet, and 375px mobile. Direction and language switch persist on every route, including 404. No horizontal overflow; mobile bottom navigation remains usable after scrolling.

## Failures found and fixed

- PostgreSQL 18 embedded Windows initdb crashed; switched scratch verifier to PostgreSQL 17.10. A reserved fixed port caused a bind failure; verifier now selects a free localhost port.
- Initial locale state produced a React lint violation; replaced it with an external store. A stale reused Playwright server later served incompatible chunks after rebuild; disabled server reuse, used a dedicated test port, and added an explicit hydration marker before locale interaction.
- Type and lint configuration errors, unapproved embedded PostgreSQL install script, and formatting issues were corrected. A clean install initially hit native binaries locked by orphaned scratch-verifier and stale Next processes; verified project processes were stopped, and the final clean install passed. Vitest worker startup timed out during a concurrent four-command run, then all six tests passed when run alone. Six development dependency advisories were resolved by updating Vitest and overriding esbuild; final audit reports zero. Added checks for logger secret redaction, tax constraint, seed idempotency, readiness with a real DB, and 375px navigation after scroll.

## Declared limitations and external dependencies

- **Local verification: PASS. Remote CI execution: NOT VERIFIED — no remote repository configured. External dependency: GitHub remote/CI execution.** The workflow parses, its commands match package.json, and the Git working tree is clean at bbea63a. The Definition of Done requires unit and Playwright tests to pass in CI, so Phase 00 remains IN PROGRESS and the audit verdict is INCOMPLETE until a real CI run is green.
- A new file-based audit pass on 2026-09-18 inspected the committed repository and reused the successful local test evidence without rerunning heavy checks. It was not performed by a different agent; no separate-agent review is claimed.
- Context7 MCP, Playwright MCP, PostgreSQL MCP, and psql are not installed or available. Official docs, Playwright CLI, and embedded PostgreSQL with node-postgres provided verified equivalents. Superpowers is unavailable; tasks/TASK-*.md is the equivalent convention.
- Phase 01 will add identity, company membership, permissions, and user-backed locale preference. Phase 00 account pages and slots explicitly defer those functions. Later financial, ZATCA, hosting, backups, and production credentials remain assigned to later phases; none is represented as working now.
