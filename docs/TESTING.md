# Testing Strategy & Quality Assurance — Saudi ERP

## 1. Testing Pyramid & Mandatory Verification

Every phase of the Saudi ERP platform must pass comprehensive automated and regression test suites before being certified as COMPLETE.

```
                  +----------------------------------+
                  |         E2E User Journeys        |
                  | (Playwright / Critical Workflows)|
                  +-----------------+----------------+
                                    |
            +-----------------------+-----------------------+
            |               Integration Tests               |
            | (DB Transactions, Posting Engine, WAC Mutex)  |
            +-----------------------+-----------------------+
                                    |
    +-------------------------------+-------------------------------+
    |                          Unit Tests                           |
    | (VAT Arithmetic, Decimal Math, TLV QR, Landed Cost Algorithms)|
    +---------------------------------------------------------------+
```

---

## 2. Test Categories & Core Test Suites

### 2.1 Accounting & Posting Invariants (`test/accounting/`)
- `posting-engine.test.ts`: Verifies that unbalanced journal lines ($Dr \neq Cr$) are rejected immediately with a descriptive error.
- `idempotency.test.ts`: Re-submitting the same `sourceKey` returns the existing entry with no duplicate ledger lines.
- `period-closing.test.ts`: Posting into closed periods is rejected unless an explicit administrative override is signed and audited.
- `reversal.test.ts`: Reversing an entry produces an equal and opposite entry with proper metadata linkage.

### 2.2 Inventory & WAC Calculations (`test/inventory/`)
- `wac-calculation.test.ts`:
  - Initial: 10 units @ 10 SAR = 100 SAR.
  - Receipt: 10 units @ 20 SAR = 200 SAR.
  - New WAC: $(100 + 200) / 20 = 15.000000 \text{ SAR}$.
- `multi-unit-conversion.test.ts`: Confirms 1 Box (24 Pieces) deducted from stock deducts exactly 24 base units from inventory.
- `negative-stock-guard.test.ts`: Rejects stock reductions below zero when company policy blocks negative stock.

### 2.3 Saudi VAT & ZATCA Verification (`test/zatca/`)
- `vat-rounding.test.ts`: Tests half-up rounding on line items and totals against ZATCA mathematical guidelines.
- `tlv-qr.test.ts`: Verifies Tag-Length-Value byte assembly and Base64 conversion for Seller Name, Tax ID, Timestamp, Total, and Tax Amount.
- `hash-chaining.test.ts`: Ensures Invoice B correctly references the SHA-256 hash of Invoice A as its `PIH`.

### 2.4 Multi-Tenancy & Authorization (`test/security/`)
- `tenant-isolation.test.ts`: Queries executed in Company A context must never return rows belonging to Company B.
- `field-masking.test.ts`: Users with Sales role receive items with `purchaseCost` stripped or nullified.

---

## 3. Regression Protocol
Before concluding any implementation phase:
1. Run all unit test suites.
2. Run database migration tests.
3. Validate complete build (`npm run build`).
4. Validate TypeScript strict typing (`npm run lint`).
5. Verify both Arabic RTL and English LTR layouts on Mobile, Tablet, and Desktop breakpoints.
