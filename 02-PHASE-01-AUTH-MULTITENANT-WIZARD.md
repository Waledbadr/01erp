# 02 — PHASE 01: AUTHENTICATION, MULTI-TENANCY, ROLES & COMPANY SETUP WIZARD

Depends on: Phase 00. Read the Master Prompt and `skills/tenant-security/SKILL.md` before starting.

---

## OBJECTIVE

Any company can register, complete a guided setup, log in securely, invite users, and manage roles — with mathematically enforced tenant isolation.

---

## A. AUTHENTICATION & SECURITY

- Email + password auth with Argon2id hashing. Secure session cookies (httpOnly, secure, sameSite), session expiry, sliding renewal where appropriate.
- Rate limiting + temporary lockout on repeated failures; failed-login log (IP, device, timestamp).
- Login history per user: last login, IP, device/session fingerprint.
- MFA/TOTP with recovery codes (hashed at rest). Enrollment and disable flows audited.
- Active session management: list sessions/devices, terminate one, terminate all.
- Password recovery via single-use, expiring, signed tokens.
- Turnstile (or equivalent) on login/register when keys are configured; Not Configured state otherwise.

## B. MULTI-TENANCY (security-critical)

- `Company` tenant model; every company-owned table carries `companyId` (NOT NULL, indexed, FK).
- Central tenant guard: one enforced chokepoint (ORM middleware/extension or query-builder wrapper) that injects `companyId` into every query — no module may bypass it. Document the mechanism in ARCHITECTURE.md.
- Membership: users can belong to multiple companies; explicit Company Switcher; active company stored server-side per session and re-verified on every request.
- Tenant isolation test (MANDATORY, automated): seed two companies with overlapping data (same customer names, same SKUs, same emails); prove via API-level tests that no endpoint, search, export, report, file URL, or background job can cross tenants. This test must fail loudly if isolation breaks.
- Storage, cache keys, background jobs, and search indexes are namespaced by tenant.

## C. ROLES & PERMISSIONS

- Default roles: Super Admin (platform), Company Admin, Accountant, Sales, Purchases, Viewer. Custom roles creatable.
- Granular permission matrix: View/Create/Edit/Delete/Approve/Post/Reverse/Print/Export/Send/Import + sensitive (Period Close/Reopen, Restore, Manage Users/Roles, Settings, ZATCA Production Switch).
- Scope: company-level; branch/warehouse scoping supported by schema (enforcement lands with those modules).
- Server-side enforcement middleware; permission checks on EVERY API route and server action. UI hides what it may, but backend always decides.
- Sensitive data hiding: users without cost/margin permission never receive cost, margin, or profit fields in any API response (not merely hidden in UI).

## D. COMPANY SETUP WIZARD

Guided, resumable wizard (skip allowed for non-critical steps, return later via Onboarding Checklist):

1. Company profile: Arabic name, English name, logo upload, address, contact info.
2. Legal/tax: VAT number, CR (Commercial Registration), Unified Number (with format validation).
3. Localization: currency (SAR default, multi-currency-ready schema), timezone (Asia/Riyadh default), language.
4. Fiscal: fiscal year start, accounting basis.
5. VAT setup: default rate, inclusive/exclusive preference, tax categories.
6. ZATCA setup screen: simulation/production toggle (locked), credential upload (CSID, certificate, encrypted private key) — Not Configured state allowed; full secrets handling per Master Prompt Part 7.
7. First branch + first warehouse + first cashbox + first bank account creation.
8. Saudi default Chart of Accounts auto-created (linked accounts for customers, suppliers, sales, purchases, VAT input/output, cash, banks, inventory, COGS — via ACCOUNT MAPPING config, never hard-coded account IDs in logic).
9. Document numbering templates per document type (prefix/sequence — concurrency-safe; uniqueness enforced by DB).
10. Invite the Company Admin (first user is admin automatically).

- Onboarding Checklist + Setup Health Check: shows completed/missing steps with deep links.
- System starts with NO demo data. Optional sandbox/demo dataset behind an explicit, fully-removable flag (isolated, never in production path).

## E. PAGES (all fully wired)

- Login / Register / Forgot Password / MFA challenge
- Company Setup Wizard (all steps above) + Onboarding Checklist
- Company Switcher
- User Management: invite (email link), activate/deactivate, reset MFA, assign roles
- Role & Permission Management (matrix editor with scope display)
- Profile: language preference, password change, MFA enrollment, active devices/sessions, login history
- Company Settings: edit everything from the wizard + document templates placeholder (templates themselves are Phase 12)
- Super Admin (platform): minimal in this phase — list companies, create company, suspend/reactivate. Full platform dashboard is Phase 20.

## F. DATA & AUDIT

- Audit events wired for: login success/failure, logout, session termination, user invite/activate/deactivate, role assignment/change, permission change, company settings change, credential operations. Per Master Prompt Part 9 (user, timestamp, company, IP, device, action, entity, before/after, reason).
- Seed framework delivers ONLY: default roles/permissions, default units, default tax rates, document types, Saudi default CoA. Zero fake business data.

---

## DEFINITION OF DONE (Phase 01)

- [ ] Full auth flow E2E works: register -> wizard -> login -> invite user -> invited user logs in with assigned role
- [ ] MFA flow works (enroll, challenge, recovery code, disable)
- [ ] Session management works (list/terminate one/terminate all)
- [ ] Tenant isolation test suite passes (green) — including same-name cross-tenant attempts via API
- [ ] Permission matrix enforced server-side; a denied-permission API test fails with 403 and leaks nothing
- [ ] Cost/margin fields absent from responses for unauthorized roles (test proves it)
- [ ] Wizard is resumable; Setup Health Check accurate; skipping non-critical steps works
- [ ] Default Saudi CoA created via mapping config; no hard-coded account IDs anywhere (scan + test)
- [ ] Document numbering is concurrency-safe (two simultaneous creations cannot collide — proven by test)
- [ ] Zero placeholders; every page works Desktop/Mobile in RTL and LTR
- [ ] Regression: Phase 00 checks still green
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
