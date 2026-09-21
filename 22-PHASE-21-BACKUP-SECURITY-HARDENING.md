# 22 — PHASE 21: BACKUPS, RESTORE & SECURITY HARDENING

Depends on: Phases 00-20. Implements Master Prompt Part 9 + Part 11 (backups: automatic, encrypted, retention 7/30/90/365, restore audited). Read `skills/tenant-security`.

---

## A. BACKUP SYSTEM

- Scheduled automated backups (daily incremental-style + weekly full) of database AND file storage; encrypted at rest (AES-256-GCM or managed equivalent); retention 7/30/90/365; off-primary storage; failure alerts via Phase 13.
- `backup_runs` (type, size, sha256, status, verifiedAt) + `backup_verifications`: scheduled RESTORE DRILLS into staging — integrity checks = row counts on critical tables + Trial Balance equality + spot journal recomputation; a backup is only "good" after a passed drill.
- Restore (full + selective where feasible) requires elevated permission, ConfirmDialog, reason, and is audit-logged (Master Prompt Part 9). `docs/DISASTER-RECOVERY.md` + `docs/BACKUPS.md` written with real measured restore times.

## B. SECURITY HARDENING (verifiable, not aspirational)

- Headers on every response: CSP, HSTS, X-Content-Type-Options, frame-ancestors; secure cookies (httpOnly/secure/sameSite); CSRF on all mutations; CORS allow-list; Origin checks.
- Sessions: idle timeout (configurable; shorter for sensitive roles), absolute expiry, rotation on login/privilege change, login history, terminate-all (Phase 01 built these — verify they hold under test here).
- Secrets scan in CI: repository + logs must never contain passwords/keys/tokens (automated check with a canary test); dependency audit (`npm audit`) zero critical unaddressed.
- DB least privilege: application role is not superuser; direct-SQL attempts to violate tenant guard or balance constraint are rejected at the DB level (extends Phase 02 defense-in-depth).
- Rate limiting + lockout re-verified across ALL public surfaces (login, API keys, webhooks, imports).

## C. PAGES

- Settings -> Backup status (last runs, drill results, manual backup trigger for permitted roles); Security page: active sessions, login history, MFA status, audit-log viewer for permitted roles (log itself protected/non-deletable from UI).

---

## TESTS (mandatory)

1. Manual backup -> encrypted artifact + sha256 recorded; scheduled job fires (test clock)
2. Restore drill to staging -> automated integrity checks pass; backup marked verified; DR doc matches reality
3. Restore without permission / without audit -> impossible (test)
4. Secrets canary: planted key in code or logs -> CI scan fails; zero secrets in runtime logs (test)
5. Headers + cookies correct on every route (assertion suite); CSRF token missing -> mutation rejected
6. Idle session expires; terminated session cannot be revived; rotation on privilege change (tests)
7. DB least privilege: app role attempts superuser action -> denied at DB level (test)
8. npm audit: zero critical unaddressed (or documented suppressions with expiry)

---

## DEFINITION OF DONE (Phase 21)

- [ ] All 8 test groups pass
- [ ] At least one real restore drill executed and recorded this phase (not theoretical)
- [ ] Zero secrets anywhere (scan green); zero critical dependency holes
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-20
- [ ] docs/DISASTER-RECOVERY.md, docs/BACKUPS.md, docs/SECURITY.md complete; PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
