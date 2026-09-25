# 18 — PHASE 17: AI ASSISTANT — LEDGER-GROUNDED Q&A & SUGGESTED ACTIONS

Depends on: Phases 02-16. Read `skills/accounting-engine`, `skills/tenant-security`. Answers come ONLY from the tenant's real data (G1/G4 source layers). Master Prompt R1/R2 apply: no fake AI responses.

---

## A. Q&A ENGINE

- Conversational interface answering business questions (balances, sales, overdue, stock, VAT position) by running parameterized read-only queries against ledger/inventory/tax layers — never against module-side caches.
- Every answer lists its sources (which report/table and period it was computed from). If data does not exist, the assistant says so — it never invents figures.
- Provider behind an interface; without credentials: feature shows Not Configured (never fabricated answers). Decision recorded in DECISIONS.md.

## B. ACTION SUGGESTIONS (READ-ONLY BY DEFAULT)

- Assistant may PROPOSE actions (e.g., "post this draft?", "send reminder to customer X?") rendered as approval cards. Nothing executes without an explicit user click.
- Approved actions execute through the existing module services (Phase 07 posting, Phase 13 reminders) — never a parallel write path. Every execution recorded with user, payload, timestamp (Master Prompt Part 9).

## C. GUARANTEES

- Tenant isolation absolute: every query passes the tenant guard (Phase 01 chokepoint) — test must attempt cross-tenant questions and fail.
- Permission-aware: a Viewer role gets read-only answers and NO action cards; sensitive data (cost/margin) never enters answers for unauthorized roles (Master Prompt Part 10).
- Full conversation audit log per company; users can delete their own conversation history (cascades correctly).

## D. PAGES

- Assistant panel (global shortcut), conversation list, answer cards with sources, action approval cards, history management. Mobile: full-screen panel.

---

## TESTS (mandatory)

1. "What are this month's sales?" -> figure matches the sales report to the cent (same query path)
2. Suggested action -> not executed until approved -> executes via existing service after approval -> audited
3. Cross-tenant question attempt -> blocked, nothing leaked (isolation test)
4. Viewer role -> no action cards; cost/margin absent from answers (test)
5. Provider Not Configured -> explicit state, no fabricated answers
6. Conversation deletion -> messages + approvals cascade correctly

---

## DEFINITION OF DONE (Phase 17)

- [ ] All 6 test groups pass
- [ ] Zero writes without explicit approval; every approval audited
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-16
- [ ] PHASE_STATUS.md updated with evidence + declared provider dependency

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
