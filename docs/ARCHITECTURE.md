# System Architecture — Saudi ERP & Business Management Platform

## 1. High-Level Architectural Overview

```
                      +------------------------------------------+
                      |         Client Browser (RTL / LTR)       |
                      |  React 19 + Vite + Tailwind CSS + Lucide |
                      +--------------------+---------------------+
                                           | HTTP / REST JSON
                                           v
+---------------------------------------------------------------------------------+
|                                 Node.js / Express Server (Port 3000)            |
|                                                                                 |
|  +--------------------------+  +------------------------+  +-----------------+  |
|  | Authentication & RBAC    |  | Tenant Context Guard   |  | Audit & Log     |  |
|  | Middleware (Tokens/CSRF) |  | (Company / Branch Isolation)| Service       |  |
|  +--------------------------+  +------------------------+  +-----------------+  |
|                                                                                 |
|  +---------------------------------------------------------------------------+  |
|  |                             Business Engines                              |  |
|  |  +-------------------+  +--------------------+  +----------------------+  |  |
|  |  |  Posting Engine   |  |  Inventory Engine  |  |  ZATCA E-Invoice     |  |  |
|  |  |  (Double-Entry GL)|  |  (WAC/Movements)   |  |  (UBL 2.1 / QR / PIH)|  |  |
|  |  +-------------------+  +--------------------+  +----------------------+  |  |
|  |  +-------------------+  +--------------------+  +----------------------+  |  |
|  |  | Payment Allocation|  | Landed Cost Engine |  | Tax & VAT Calculation|  |  |
|  |  +-------------------+  +--------------------+  +----------------------+  |  |
|  +---------------------------------------------------------------------------+  |
|                                           |                                     |
|  +---------------------------------------------------------------------------+  |
|  |                 Data Access Layer & Transaction Boundary                  |  |
|  |     (ACID Transactions, Row-Level Locking, Idempotency Enforcers)         |  |
|  +---------------------------------------------------------------------------+  |
+-------------------------------------------+-------------------------------------+
                                            |
                                            v
                      +------------------------------------------+
                      |       Relational Persistence Engine       |
                      |    (PostgreSQL / Drizzle Schema Model)   |
                      +------------------------------------------+
```

## 2. Layer Definitions

### 2.1 Presentation Layer (Frontend)
- **Framework**: React 19 SPA running behind Express reverse-proxy middleware on port 3000.
- **Styling**: Tailwind CSS v4 utility classes, strictly accessible contrast (WCAG AA), responsive for Desktop (1440px+), Tablet (768px-1024px), and Mobile (375px-480px).
- **Localization**: Native Arabic (`ar-SA`) with standard typography, right-to-left layout direction, and English (`en-US`) LTR mode with instantaneous runtime switching.
- **Financial Precision UI**: Display formatting via centralized currency formatters (`SAR 1,250.50` / `١٬٢٥٠٫٥٠ ر.س`).

### 2.2 Application & Service Layer (Backend)
- **Runtime**: Node.js + Express with strict TypeScript.
- **Port**: Bound to host `0.0.0.0` and port `3000` for container ingress.
- **REST Endpoints**: Organized under `/api/v1/...`.
- **Tenant Context**: Enforced by server middleware via HTTP headers and session tokens. No query executes without an authenticated `companyId`.

### 2.3 Core Domain Engines
1. **Posting Engine (`GLPostingEngine`)**:
   - Accepts posting requests with balanced debit/credit lines.
   - Idempotent via `sourceKey` (e.g., `INV-2026-0001:POST`).
   - Generates immutable `JournalEntry` and `JournalLine` records.
   - Calculates hash chaining (`prevEntryHash -> currentEntryHash`).
2. **Inventory Engine (`InventoryEngine`)**:
   - Tracks movements: `RECEIPT`, `ISSUE`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT_POS`, `ADJUSTMENT_NEG`.
   - Recalculates Weighted Average Cost (WAC) per item-unit on receipt with row locking.
   - Enforces negative-stock prevention rules unless company-level override is explicitly configured and authorized.
3. **ZATCA Adapter (`ZatcaEngine`)**:
   - Generates UBL 2.1 XML invoices.
   - Creates cryptographic SHA-256 invoice hashes.
   - Maintains previous invoice hash chaining (`PIH`).
   - Produces standard TLV (Tag-Length-Value) Base64 QR codes containing: Seller Name, VAT Number, Timestamp, Total with VAT, and VAT Amount.

### 2.4 Data Integrity & Concurrency
- Database operations involving financial or inventory balances execute inside explicit database transactions.
- Critical stock mutations utilize row-level locking (`FOR UPDATE`) to eliminate race conditions between concurrent transactions.
- Strict database constraints: foreign keys on delete restrict for posted financial records, unique document sequence numbers per company/year, check constraints for positive quantities and balanced debits/credits.
