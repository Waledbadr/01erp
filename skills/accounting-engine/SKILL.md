---
name: accounting-engine
description: Apply the project's immutable, balanced journal contract when implementing or reviewing financial posting.
---

# Accounting engine

Read before changing financial posting. One postJournal(companyId, sourceType, sourceId, sourceKey, lines, postedBy, date) command runs in one PostgreSQL transaction. Require at least two lines; each has account, debit or credit exact decimal, currency, and optional party/branch. Validate one-sided positive lines and equal debit/credit totals. Unique (companyId, sourceKey) gives idempotency; retries return the existing journal. Lock period state, reject closed period unless special permission is checked and audited. Store postedAt, postedBy, source link, and prior-hash/hash when chaining applies. Prevent UPDATE/DELETE of posted journals and lines. A deferred DB constraint trigger checks balance at commit. Correction creates a reversal journal with swapped debit/credit and link to the original.

Examples (SAR): cash sale 115 including VAT: Dr Cash 115, Cr Revenue 100, Cr Output VAT 15. Credit sale: Dr AR 115, Cr Revenue 100, Cr Output VAT 15. Receipt allocated to that sale: Dr Bank 115, Cr AR 115; allocation record links receipt and invoice and is audited. Sales return: Dr Revenue 100, Dr Output VAT 15, Cr AR or Cash 115; stock return separately Dr Inventory/Cr COGS at original return cost. Purchase 1000 plus VAT 150: Dr Inventory 1000, Dr Input VAT 150, Cr AP 1150; freight capitalized 200: Dr Inventory 200, Cr AP or Bank 200. Cash expense 100 plus VAT 15: Dr Expense 100, Dr Input VAT 15, Cr Cash 115. Accrued expense: same debits, Cr AP 115. Accounts and tax treatment come from configuration and source facts; examples are illustrative assertions, never hard-coded posting rules.
