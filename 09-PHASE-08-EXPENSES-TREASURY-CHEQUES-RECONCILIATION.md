# 09 — PHASE 08: EXPENSES, TREASURY, CHEQUES & BANK RECONCILIATION

Depends on: Phases 02, 03. Read `skills/accounting-engine`, `skills/saudi-vat`.

---

## A. EXPENSES

- Expense categories (configurable, mapped to expense accounts via Account Mapping).
- Expense types: direct (no supplier), supplier-linked; payment status: paid now (cash/bank) or accrued (payable).
- Tax treatment: taxable (input VAT at line level, G8 rounding) or non-taxable; per-line account selection; cost center (optional); branch; attachments (receipts/invoices); notes.
- Posting contract: Paid: Dr Expense + Dr VAT Input / Cr Cash|Bank. Accrued: Dr Expense + Dr VAT Input / Cr Accrued Expenses (or supplier AP if linked); later settlement: Dr Accrued|AP / Cr Cash|Bank.
- Recurring expenses: schedule (daily/weekly/monthly/annual + end date) generates DRAFTS only — never auto-posts; preview + one-click post.
- Approval flow per company setting (submit -> approve -> post), fully audited.

## B. TREASURY (CASHBOXES & BANKS)

- Multiple cashboxes + bank accounts (bank name, account name, IBAN, account number, currency — SAR now, multi-currency-ready schema).
- Balance per account is ALWAYS ledger-derived (G1) — computed from journals, never a mutable balance column.
- Transfers: cash->cash, bank->bank, cash<->bank (deposit/withdrawal): two-legged movement with confirmation; journaled; fees field (fee -> charges account). Idempotent; reversal via reverse action.
- Treasury dashboard: all accounts with current balances, recent movements, drill-down to ledger.

## C. CHEQUES

- Customer cheques received against receipts: cheque number, bank, due date, amount, customer, status machine: Received -> Under Collection -> Collected | Returned | Cancelled. Each transition journaled appropriately (Collected: value settles; Returned: reversal + follow-up flag on customer).
- Supplier cheque functionality: architecture-ready, feature-flagged OFF by default (record decision in DECISIONS.md + PHASE_STATUS.md).

## D. BANK RECONCILIATION

- Import bank statement: CSV/Excel with column mapping wizard (date, amount, reference, description); parsing validation with row errors.
- Auto-matching: amount + date window + reference similarity; produces Matched / Unmatched / Ambiguous buckets; manual match UI (search ledger entries, pair them).
- Reconciliation session per account/period: statement balance vs ledger balance; matched items locked for that session; unmatched items listed with one-click journal creation for true bank charges/interest (through manual journal flow).
- Complete -> report (matched count/amount, differences); reopening requires permission + audit.

## E. PAGES (all fully wired)

- Expenses: list (filters category/type/status/tax), create/edit (draft), detail (journals deep-link, attachments), recurring templates list.
- Treasury: accounts dashboard, transfer screen, per-account ledger view.
- Cheques: list with status filters and bulk actions; cheque detail with lifecycle timeline.
- Reconciliation: import -> match -> review -> complete flow, with statement-vs-ledger summary.
- Payment voucher / receipt voucher pages feeding G5 allocation engine (also used by Phases 06-07).

---

## TESTS (mandatory)

1. Paid taxable expense: exact journal (expense + input VAT + cash)
2. Accrued expense -> accrual journal; settlement journal exact; both reconcile to ledger
3. Recurring schedule generates drafts only (never posted) — test
4. Transfer cash->bank with fee: journals exact both legs + fee; account balances correct
5. Cheque lifecycle: Received -> Under Collection -> Collected (journals); Returned path reverses correctly + flags customer
6. Reconciliation: 20-line import -> auto-match rate asserted; manual match works; completing produces correct difference report; reopen audited
7. Treasury balances equal ledger sums (property test over randomized-but-seeded flows)
8. Idempotency: repeated transfer request -> one transfer

---

## DEFINITION OF DONE (Phase 08)

- [ ] All 8 test groups pass
- [ ] Reconciliation flow completes end-to-end in E2E with a real imported statement file
- [ ] Treasury dashboard balances match ledger exactly (test)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-07
- [ ] PHASE_STATUS.md updated with evidence

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
