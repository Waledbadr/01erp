# Architecture Decision Records (ADRs) — DECISIONS.md

This document records all principal architectural and technical decisions made for the Saudi ERP & Business Management Platform.

---

## ADR-001: Runtime Platform & Single Port 3000 Ingress
- **Context**: The deployment environment runs inside a Cloud Run container where port 3000 is the only externally routable port via reverse proxy.
- **Decision**: Mount the Express API server and Vite single-page application on the unified server process binding to `0.0.0.0:3000`. In development, Express mounts Vite middleware (`middlewareMode: true`). In production, Express serves compiled static client assets from `dist/` with SPA fallback.
- **Consequences**: Zero CORS issues, shared runtime context, consistent session handling, and direct alignment with the container sandbox specifications.

---

## ADR-002: Relational Schema & ORM Model (Drizzle / PostgreSQL)
- **Context**: Double-entry bookkeeping, strict foreign-key cascades/restrictions, and multi-tenant financial data require strict relational ACID transactions.
- **Decision**: Standardize on PostgreSQL with Drizzle ORM schema declarations. Strict schema tables for companies, branches, warehouses, accounts, journal entries, journal lines, items, units, barcodes, stock movements, invoices, invoice lines, payments, and audit logs.
- **Consequences**: Type-safe migrations, zero ORM runtime overhead, high performance, and exact SQL generation for row-locking (`FOR UPDATE`) during inventory WAC recalculation.

---

## ADR-003: Fixed-Precision Financial Mathematics (Rule G7)
- **Context**: Floating-point IEEE 754 numbers (`0.1 + 0.2 = 0.30000000000000004`) cause severe financial discrepancies and violate accounting and ZATCA compliance.
- **Decision**: Financial amounts are stored as exact decimal numbers (`DECIMAL(19,4)` for monetary amounts, `DECIMAL(19,6)` for unit costs and conversion factors). All calculations are executed using deterministic integer/decimal arithmetic utilities with line-level half-up rounding to 2 decimal places.
- **Consequences**: Exact debit/credit balance equality, zero float accumulation errors, and 100% audit compliance.

---

## ADR-004: Centralized Immutable Posting Engine (Rules G1, G2)
- **Context**: Allowing individual modules (Sales, Purchasing, Inventory) to update balance fields directly causes ledger drift and inconsistent financial reports.
- **Decision**: All balance modifications must pass through `GLPostingEngine.postJournal()`. Journal entries are strictly immutable. Once posted, an entry cannot be modified or deleted. Corrections require an explicit reversing journal entry. Every journal entry incorporates an idempotency key (`sourceKey`) and a cryptographic SHA-256 hash chaining to the preceding entry.
- **Consequences**: The General Ledger is the single source of financial truth. No balance discrepancy can ever exist.

---

## ADR-005: Item-Unit-Specific Barcode & Conversion Architecture (Rules I1, I4)
- **Context**: In commercial reality, products have multiple packaging units (e.g., Piece, Pack of 6, Box of 24) where conversion ratios are item-dependent and each packaging unit carries its own distinct barcode.
- **Decision**: Barcodes are assigned to the `ItemUnit` relation, not the base `Item`. Each unit records its item-specific multiplier relative to the base unit (`isBaseUnit: boolean`, `conversionFactor: decimal`). Barcode lookups resolve directly to both the item and the packaging unit.
- **Consequences**: Accurate POS scanning, automated inventory conversion, and zero packaging errors.

---

## ADR-006: Weighted Average Cost (WAC) with Serialized Row Locking (Rule I2)
- **Context**: Concurrent purchase receipts of the same item can cause race conditions when calculating new average costs.
- **Decision**: Recalculation of WAC executes within a transaction that acquires a row-level lock (`SELECT ... FOR UPDATE`) on the target item's warehouse stock balance record. The formula applied is:
  `New WAC = (Current Stock Qty * Current WAC + Incoming Qty * Effective Unit Cost) / (Current Stock Qty + Incoming Qty)`.
- **Consequences**: Total cost integrity is guaranteed even under high concurrent receipt volumes.

---

## ADR-007: ZATCA Phase 2 E-Invoicing Internal Architecture (Part 7)
- **Context**: Saudi ZATCA e-invoicing requires cryptographic hashing, previous-invoice hash chaining (`PIH`), TLV QR code generation, and UBL 2.1 XML output.
- **Decision**: Decouple the base invoice generation from external ZATCA submission. Invoices are committed and posted first with complete internal hash, QR, and XML artifacts generated synchronously. External transmission to the ZATCA portal executes via a resilient asynchronous background job with retry and status tracking (`NOT_SUBMITTED`, `PENDING`, `CLEARED`, `REPORTED`, `REJECTED`).
- **Consequences**: A temporary failure or network delay from ZATCA will never block customer checkout or store operations.

---

## ADR-008: Native Bidirectional Localization (Arabic RTL First, English LTR Instant Toggle)
- **Context**: Saudi ERP users primarily operate in Arabic with RTL orientation, while accounting and management users frequently require English LTR reporting.
- **Decision**: Build the UI with complete bidirectional styling using native Tailwind logical utilities (`start-`, `end-`, `ms-`, `me-`) and a centralized translation dictionary with zero hardcoded strings. Locale switching toggles `dir="rtl"` / `dir="ltr"` on the document root immediately without page reloads.
- **Consequences**: Natural, ergonomic experience for both Arabic and English users.

---

## ADR-009: Treasury, Bank Reconciliation & Cheques Architecture (Phase 08)
- **Context**: Treasury operations require managing multiple cash drawers, bank accounts, SAMA-compliant IBAN verification, petty cash settlements, multi-line bank statement reconciliations, and customer/supplier cheques lifecycle.
- **Decision**: 
  1. All treasury balances are computed dynamically from immutable General Ledger journals (Rule G1), never stored in mutable balance fields.
  2. Inward customer cheques follow a strict finite-state machine (`RECEIVED` -> `UNDER_COLLECTION` -> `COLLECTED` | `RETURNED` | `CANCELLED`) with automated double-entry journal postings upon transitions.
  3. Supplier outward cheque functionality is designed with full architectural data schemas and journal templates, but is feature-flagged `OFF` by default (`features.supplierChequesEnabled = false`) until an explicit outward chequebook policy is activated per tenant.
  4. Bank reconciliations support automated multi-rule matching (date tolerance, reference similarity, amount equality) and one-click adjusting journal entry generation for bank fees and interest.
- **Consequences**: Robust treasury auditability, zero ledger balance discrepancy, and reliable bank-statement verification.

---

## ADR-010: OCR Supplier Invoice Capture & Honest Provider Architecture (Phase 17)
- **Context**: Processing supplier invoices requires automated extraction of header fields (Supplier Name, 15-digit VAT number, CR number, Invoice #, Dates, Currency, Subtotals, VAT 15%, Totals) and line items, while strictly obeying accounting safety rules (Rule G1, R1, R2, R3).
- **Decision**:
  1. **Strict Non-Auto-Posting**: OCR output is strictly staged as uncommitted job data and creates only a `DRAFT` purchase bill (`source='ocr'`, linked `ocrJobId`) upon explicit human confirmation. Draft bills touch neither the General Ledger nor inventory balances until passed through the formal Phase 06/07 review, 3-way matching, and posting workflow.
  2. **Confidence Threshold & Blocking (< 0.85)**: Any field extracted with confidence below 0.85 is flagged with a red warning badge, and draft commitment is blocked until the user either manually corrects the value or explicitly confirms accuracy.
  3. **Full Audit Traceability**: Every manual correction is recorded in an immutable audit trail (`ocr_corrections`) capturing the field name, before value, after value, user ID, and timestamp.
  4. **Pluggable `OcrProvider` with Honest Not-Configured State**: The OCR pipeline runs behind the `OcrProvider` abstraction. When API keys (e.g. Gemini Vision) are not configured, the adapter reports an explicit `NOT_CONFIGURED` status and keeps jobs pending/unprocessed without ever fabricating fake success.
- **Consequences**: Complete protection against unauthorized or incorrect ledger postings, high data accuracy, transparent provider management, and full audit compliance.

