---
name: testing-standards
description: Testing standards, test layout, factories, fixed financial test data conventions, journal assertion helpers, VAT assertion helpers, idempotency test patterns, and tenant isolation tests.
---

# Testing Standards Skill (`skills/testing-standards/SKILL.md`)

## 1. Golden Rules of ERP Testing
1. **Never Random Money Values**: Never use `Math.random()` to generate currency or tax figures in automated tests. All amounts must be deterministic, fixed test numbers (e.g. `1000.00`, `1150.00`, `2300.00`) to enable exact bit-level and halala-level assertions.
2. **Always Integer Halalas / Fixed-Point**: Financial arithmetic assertions must compare exact integer cents or decimal strings with explicit tolerance:
   ```typescript
   expect(journal.totalDebitCents).toBe(journal.totalCreditCents);
   ```
3. **No Network Leaks**: External services (ZATCA servers, SMS gateways, payment processors) must be isolated with hermetic mock adapters in unit/integration tests.

---

## 2. Standard Test Layout
Tests are organized logically under `src/__tests__/`:
```
src/__tests__/
  ├── accounting.test.ts       # Rules G1-G8, posting balance, reversals
  ├── inventory.test.ts        # Rules I1-I6, WAC, unit conversions, barcodes
  ├── zatca.test.ts            # TLV QR generation, 15-digit VAT, XML hashing
  ├── vat.test.ts              # 15% VAT inclusive/exclusive, line rounding
  ├── security.test.ts         # Tenant isolation guard, RBAC matrix, audit log
  ├── e2e.test.ts              # Full lifecycle integration flow
  └── helpers/
      ├── journalAssertions.ts
      ├── testFactories.ts
      └── vatAssertions.ts
```

---

## 3. Test Assertion Helpers

### 3.1 Journal Balanced Assertion Helper:
```typescript
export function expectBalancedJournal(journal: {
  lines: Array<{ debitCents: bigint; creditCents: bigint }>;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
}) {
  let calculatedDebit = 0n;
  let calculatedCredit = 0n;
  for (const line of journal.lines) {
    calculatedDebit += line.debitCents;
    calculatedCredit += line.creditCents;
  }
  expect(calculatedDebit).toBe(calculatedCredit);
  expect(journal.totalDebitCents).toBe(calculatedDebit);
  expect(journal.totalCreditCents).toBe(calculatedCredit);
}
```

### 3.2 VAT Rounding Assertion Helper:
```typescript
export function expectValidSaudiVat(exclusiveSar: number, vatSar: number, totalSar: number) {
  const calculatedVat = Math.round(exclusiveSar * 15) / 100;
  const calculatedTotal = Math.round((exclusiveSar + calculatedVat) * 100) / 100;
  expect(vatSar).toBeCloseTo(calculatedVat, 2);
  expect(totalSar).toBeCloseTo(calculatedTotal, 2);
}
```

---

## 4. Idempotency Test Pattern
Verify that submitting the same posting request twice results in identical journal records without duplicating general ledger rows:
```typescript
test('idempotency prevents duplicate journal entries on re-post', async () => {
  const payload = {
    tenantId: 'tenant_test_1',
    sourceType: 'INVOICE',
    sourceId: 'inv_1001',
    sourceKey: 'inv_1001_post_v1',
    lines: [...]
  };

  const firstResult = await postJournalEntry(payload);
  const secondResult = await postJournalEntry(payload);

  expect(firstResult.journalId).toBe(secondResult.journalId);
  const allJournals = await getJournalsBySource('tenant_test_1', 'INVOICE', 'inv_1001');
  expect(allJournals.length).toBe(1);
});
```

---

## 5. Tenant Isolation Test Pattern
Verify that Tenant B can never query, read, or mutate data owned by Tenant A:
```typescript
test('tenant guard rejects cross-tenant access', async () => {
  const tenantA_id = 'tenant_alpha';
  const tenantB_id = 'tenant_beta';

  const docA = await createInvoice(tenantA_id, { amount: 1000 });
  
  // Attempt to fetch docA while authenticated as tenantB
  const result = await getInvoiceById(tenantB_id, docA.id);
  expect(result).toBeNull();
});
```
