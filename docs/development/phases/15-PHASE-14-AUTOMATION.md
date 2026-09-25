# 15 — PHASE 14: AUTOMATION ENGINE

Depends on Phase 13 (notification/action channels exist).

---

## A. RULE ENGINE

- Triggers: document created/submitted/approved/posted, payment received, low stock detected, credit-limit breach, invoice overdue, ZATCA failure, backup failure, subscription event (Phase 20).
- Conditions: AND/OR groups over fields (customer, supplier, item, amount thresholds, branch, warehouse, payment method, user/role).
- Actions: send notification, send email, create task, create draft document (e.g., draft expense from rule), change status (where safe), tag record, call webhook (signed), delay/schedule.
- Each rule: enable/disable, effective window, priority, execution history, per-run audit. Dry-run/test mode with sample payload. Failed actions retry per policy and surface in notification center.

## B. PAGES

- Rules list (enable toggles, last-run status), rule builder (visual condition tree), execution history with error detail.

---

## DEFINITION OF DONE (Phase 14)

- [ ] At least these E2E rules proven: low-stock -> notify buyer; invoice posted over amount X -> notify manager; overdue -> schedule reminder (integration with Phase 13); ZATCA failure -> alert + retry webhook
- [ ] Condition tree evaluates correctly on seeded cases (unit tests incl. nested AND/OR)
- [ ] Dry-run mode shows matched records without side effects (test)
- [ ] Failed action retries and is logged (test)
- [ ] Zero dead actions; mobile/RTL/LTR verified; regression green
- [ ] PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
