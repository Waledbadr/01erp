# Accounting rules

All financial operations post through one transactional, idempotent engine. Journals balance to the minor currency unit before writing and at the database boundary. Posted journals are immutable; corrections create reversing journals. Closed periods reject posting absent separately authorized, audited override. Statements and balances derive from ledger lines and allocations. See skills/accounting-engine/SKILL.md for implementation contract.
