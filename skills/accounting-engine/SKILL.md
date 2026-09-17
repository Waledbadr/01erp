---
name: accounting-engine
description: Rules and contract for the double-entry posting engine, journal shape, idempotency, DB-level balance enforcement, reversal-only corrections, and period locking.
---

# Accounting Engine Skill (`skills/accounting-engine/SKILL.md`)

## 1. The Core Posting Contract (Rules G1 & G2)
The General Ledger (GL) is the sole and immutable single source of truth for all financial transactions. 

### Invariants:
1. **Mathematical Invariant**: For every journal entry posted to the General Ledger:
   $$\sum \text{Debits} = \sum \text{Credits}$$
   Must match to exactly 2 decimal places using fixed-point integer cents (1 SAR = 100 Halalas).
2. **Immutability Invariant (G2)**: Once a journal is posted, it is strictly write-once and permanent. It can **NEVER** be edited, soft-deleted, or removed.
3. **Correction Policy**: Errors must only be corrected by posting a compensating Reversal Journal (`reversalOfJournalId`) and an optional new correcting journal.
4. **Idempotency Key**: Posting requests must require a unique compound key `(tenant_id, source_type, source_id, source_key)`. Re-submitting the exact same transaction returns the existing posted journal ID without duplicating ledger lines.
5. **Period Lock**: No journal can be posted into a closed accounting period without explicit override permissions by an authorized controller.

---

## 2. Journal Shape & Database Representation

```typescript
export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId: string;
  entryNumber: string; // Sequential human-readable format: JV-YYYY-XXXXX
  entryDate: string; // ISO 8601 YYYY-MM-DD
  periodId: string;
  sourceType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'BILL' | 'INVENTORY_ADJUSTMENT' | 'MANUAL';
  sourceId: string;
  sourceKey: string; // Deterministic idempotency token
  descriptionAr: string;
  descriptionEn: string;
  totalDebitCents: bigint; // Exact integer halalas
  totalCreditCents: bigint;
  status: 'POSTED' | 'REVERSED';
  reversalOfJournalId?: string | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLine[];
}

export interface JournalLine {
  id: string;
  journalId: string;
  accountId: string; // References Chart of Accounts
  accountCode: string;
  debitCents: bigint;
  creditCents: bigint;
  descriptionAr?: string;
  descriptionEn?: string;
  costCenterId?: string | null;
}
```

---

## 3. Worked Journal Examples

### 3.1 Cash Sale (Simplified Tax Invoice, 15% VAT)
*Total Sale: 1,150.00 SAR (1,000.00 Net + 150.00 VAT)*
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 10101 | Cash on Hand (Main Vault) | 1,150.00 | 0.00 |
| 40101 | Commercial Sales Revenue | 0.00 | 1,000.00 |
| 20301 | VAT Output Tax Payable (15%) | 0.00 | 150.00 |

### 3.2 Credit Sale (B2B Standard Tax Invoice, 15% VAT)
*Customer Invoice: 2,300.00 SAR (2,000.00 Net + 300.00 VAT)*
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 10201 | Accounts Receivable — Client A | 2,300.00 | 0.00 |
| 40101 | Commercial Sales Revenue | 0.00 | 2,000.00 |
| 20301 | VAT Output Tax Payable (15%) | 0.00 | 300.00 |

### 3.3 Receipt with Customer Allocation & Bank Fee
*Customer pays 2,300.00 SAR via POS/Mada, bank charges 11.50 SAR fee (10.00 + 1.50 VAT)*
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 10102 | Operating Bank Account | 2,288.50 | 0.00 |
| 50401 | Bank Service Charges | 10.00 | 0.00 |
| 10301 | VAT Input Tax Recoverable (15%) | 1.50 | 0.00 |
| 10201 | Accounts Receivable — Client A | 0.00 | 2,300.00 |

### 3.4 Sales Return (Credit Note with Tax Reversal)
*Customer returns goods: 575.00 SAR (500.00 Net + 75.00 VAT), credited to AR*
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 40102 | Sales Returns & Allowances | 500.00 | 0.00 |
| 20301 | VAT Output Tax Payable (Reversed) | 75.00 | 0.00 |
| 10201 | Accounts Receivable — Client A | 0.00 | 575.00 |

### 3.5 Purchase + Allocated Landed Cost
*Goods Purchase: 10,000.00 SAR + 1,500.00 VAT. Freight & Customs: 800.00 SAR cash.*
**Journal 1: Purchase Bill from Supplier**
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 10401 | Inventory on Hand (Merchandise) | 10,000.00 | 0.00 |
| 10301 | VAT Input Tax Recoverable (15%) | 1,500.00 | 0.00 |
| 20101 | Accounts Payable — Supplier X | 0.00 | 11,500.00 |

**Journal 2: Landed Cost Capitalization**
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 10401 | Inventory on Hand (Capitalized Freight) | 800.00 | 0.00 |
| 10101 | Cash / Bank (Freight Provider) | 0.00 | 800.00 |

### 3.6 Expense (Accrued Utilities Expense)
*Month-end electricity bill accrued: 1,150.00 SAR (1,000.00 Net + 150.00 VAT)*
| Account Code | Account Name | Debit (SAR) | Credit (SAR) |
| :--- | :--- | :---: | :---: |
| 50105 | Utilities & Electricity Expense | 1,000.00 | 0.00 |
| 10301 | VAT Input Tax Recoverable | 150.00 | 0.00 |
| 20201 | Accrued Expenses Payable | 0.00 | 1,150.00 |

---

## 4. Database-Level Balance Enforcement
All postings MUST be wrapped in a database transaction with a deferred constraint or immediate post-check:
```sql
-- Database Check Trigger / Transaction Guard:
SELECT SUM(debit_cents) - SUM(credit_cents) AS balance_diff
FROM journal_lines
WHERE journal_id = $1;
-- If balance_diff != 0 THEN ROLLBACK AND RAISE EXCEPTION 'JOURNAL_UNBALANCED_HALALAS';
```
