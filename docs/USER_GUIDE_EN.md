# User Guide — Saudi ERP & Business Management Cloud Platform

## Welcome to the Enterprise Cloud Management Platform
Engineered specifically for companies operating in the Kingdom of Saudi Arabia, fully compliant with ZATCA (FATOORA) e-invoicing Phase 2 regulations, Ministry of Commerce guidelines, and international double-entry accounting standards.

---

## 1. Dashboard & Core Navigation
- **Instant Dual-Language Support**: Seamlessly switch between Arabic (RTL) and English (LTR) at any time without losing context.
- **Real-Time KPI Widgets**:
  - Daily & monthly sales vs. purchases.
  - Cash on hand and commercial bank balances (Al Rajhi, SNB, Riyad Bank).
  - Accounts Receivable (customer receivables) and Accounts Payable (vendor liabilities).
  - Low stock alerts and overdue invoice notifications.

---

## 2. Sales & ZATCA E-Invoicing

### Creating a Standard Tax Invoice (B2B):
1. Navigate to **Sales** -> **Invoices** -> **New Invoice**.
2. Select invoice type: **Standard Tax Invoice (B2B)**.
3. Choose the customer; their 15-digit VAT number and registered address populate automatically.
4. Add line items, choose packaging units (Piece, Pack, Carton), enter quantities, and specify unit prices.
5. System automatically computes 15% VAT per line item using standard half-up rounding.
6. Upon clicking **Post Invoice**:
   - Automated double-entry journal is posted (Debit: Customer AR, Credit: Sales Revenue & Output VAT Payable).
   - Inventory is deducted from the specified warehouse and COGS is recognized.
   - ZATCA Phase 2 compliant TLV Base64 QR code and cryptographic invoice hash are generated.

### Simplified Tax Invoice (B2C):
- Tailored for retail and direct consumer sales with instant POS printing and embedded compliant QR code.

### Credit & Debit Notes:
- To process customer returns or price adjustments on posted invoices, create a Credit Note linked to the original invoice UUID. The system automatically reverses the corresponding financial entries and restores warehouse stock.

---

## 3. Purchasing & Landed Costs
- **Vendor Bill Entry**: Capture supplier invoices with 15-digit Tax ID validation.
- **Input VAT (15%) Recovery**: Automatically post deductible VAT into the Input VAT Recoverable asset account for tax return offset.
- **Landed Cost Distribution**: Apportion customs duties, freight, handling, and clearance fees onto purchased inventory lines by value, quantity, or custom ratios to establish true Weighted Average Cost (WAC).

---

## 4. Inventory & Warehouse Operations
- **Multi-Unit Packaging with Item-Specific Conversions**: Define custom conversions per product (e.g. 1 Carton = 24 Pieces for Item A; 1 Carton = 12 Bottles for Item B).
- **Unit-Specific Barcodes**: Unique barcode for each unit variant for error-free scanning.
- **Perpetual Weighted Average Cost (WAC)**: Automatically recalculated upon each purchase receipt.
- **Inter-Warehouse Transfers**: Move goods between central hubs and branch locations with status tracking.
- **Stocktakes & Cycle Counts**: Record physical inventory counts, compare against book balances, and post variance journals.

---

## 5. Payments, Cash Flow & Financial Statements
- **Receipt Vouchers (Customers)**: Collect payments via Cash, Bank Transfer, Mada/POS, or Check with single or multi-invoice allocation.
- **Payment Vouchers (Suppliers)**: Settle vendor bills with clear remittance records.
- **Partner Statements**: Generated directly from General Ledger transactions with 30/60/90/+90 day aging analysis.
- **Financial Statements**:
  - Trial Balance (Debits & Credits).
  - Income Statement (Profit & Loss).
  - Balance Sheet (Financial Position).
  - VAT Return Summary (ready for ZATCA portal reconciliation).
