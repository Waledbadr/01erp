# 23 — PHASE 22: FINAL QA, ACCEPTANCE & PRODUCTION READINESS

Depends on: Phases 00-21 ALL COMPLETE with audits passed. Read `skills/phase-exit-checklist`, `skills/testing-standards`. Master Prompt Part 12/13 apply in full.

---

## A. ACCOUNTING ACCEPTANCE SUITE — 27 SCENARIOS (mandatory, in order)

Executed for real (UI or API against DB), each scenario's result measured from the ledger:

- **Sales & receipts (1-5):** 1) cash sale journals exact (cash/revenue/VAT/COGS/stock) 2) credit sale + correct due date from terms 3) partial then full allocation; balance exact 4) return after posting -> reversal journals + restock (no mutation) 5) overpayment -> advance -> later consumption.
- **Purchases & inventory (6-12):** 6) PO -> partial GRN -> bill (3-way match clean) 7) landed cost -> WAC matches hand computation 8) purchase return reversals exact 9) WAC across mixed receipts/issues matches manual weighted average to the cent 10) stocktake variance -> movements + journals 11) transfer between warehouses preserves total value 12) negative stock blocked (default) with audited override.
- **Treasury & cheques (13-17):** 13) expense paid vs accrued journals 14) transfer with fee exact 15) cheque lifecycle Collected + Returned reversal 16) bank reconciliation import -> match -> complete -> difference report 17) treasury balances = ledger sums (property test).
- **VAT, periods & reports (18-23):** 18) mixed-rate invoice (5/15/zero/exempt) -> VAT report exact 19) credit note reverses tax from snapshot 20) trial balance + P&L + balance sheet reconcile to the cent against seeded journals 21) closed period rejects posting; override audited 22) year closing -> retained earnings correct, opening carried 23) customer/supplier statements ledger-derived, aging buckets correct.
- **Cross-cutting (24-27):** 24) OCR -> draft -> posted purchase -> stock -> journals chain end-to-end 25) import a real messy file -> clean batch report (Phase 19) 26) ZATCA XML validates + hash chain intact + failure never blocks posting 27) full regression suite (every phase's tests) green in one run.

## B. PRODUCTION READINESS CHECKLIST (evidence-based)

- [ ] `PHASE_STATUS.md`: every phase COMPLETE with its audit report; declared gaps listed explicitly (R2 — no hidden gaps)
- [ ] Repo scan: zero TODO/FIXME/PLACEHOLDER/MOCK in production paths (R4)
- [ ] CI green: typecheck, lint, unit, integration, E2E on every push (Phase 00 pipeline still enforced)
- [ ] Migrations: up AND down verified on a production-like copy; rollback plan written
- [ ] Backups scheduled + one restore drill recorded (Phase 21 evidence)
- [ ] Monitoring: health endpoints, error tracking, uptime alerts, log retention; correlation IDs working end-to-end
- [ ] Security: headers, rate limits, secrets scan, dependency audit — all green with evidence
- [ ] Performance: seeded large dataset (tens of thousands of invoices) — report generation < 3s p95, list pages < 1s p95, no full-table loads
- [ ] `docs/RUNBOOK.md`: deploy, rollback, restore, incident contacts; `docs/DEPLOYMENT.md` matches the real environment
- [ ] User guides AR/EN exist and match the shipped UI (spot-checked)

## C. SMOKE TEST (runs on production after every deploy; deploy fails if red)

1. Login + dashboard loads with live numbers 2) create+post a test sale -> journal visible -> reverse it 3) key PDF renders Arabic correctly 4) trial balance returns under 3s 5) ZATCA ping/simulation endpoint healthy 6) backup job status green.

---

## DEFINITION OF DONE (Phase 22)

- [ ] 27/27 acceptance scenarios pass with recorded evidence
- [ ] Every checklist item has a linked artifact (report/file/URL) — no unchecked boxes
- [ ] Smoke test wired into the deploy pipeline (test: forced failure blocks deploy)
- [ ] Final full regression: ALL phases' suites green in a single run
- [ ] PHASE_STATUS.md updated: project status COMPLETE with declared external dependencies only (real ZATCA credentials, payment gateway keys)

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md) — final, covering Phases 00-22.
