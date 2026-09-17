# TASK-002: Phase 00 foundation

Status: IN PROGRESS

Acceptance criteria: Complete Phase 00 A1–A4, B, and C; verify scratch PostgreSQL migration up/down/up and system seed; run lint, typecheck, build, unit/integration and Playwright tests; inspect desktop/tablet/375px mobile in ar and en; audit actual repository; update status and docs from evidence.

Verification: Local checks passed: clean npm ci with Node 23 engine override, npm audit 0 vulnerabilities, format:check, lint, typecheck, build, 6 Vitest tests, PostgreSQL 17.10 migration up/down/up and readiness, 10 Playwright tests, and visual review at 1440/768/375px in both directions. The external GitHub Actions run and separate fresh-session audit remain pending; this task stays IN PROGRESS until those gates pass.
