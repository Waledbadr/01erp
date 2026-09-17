# Saudi ERP & Business Management Platform — Project Specification

## 1. Executive Summary
The Saudi ERP & Business Management Platform is an enterprise-grade, cloud-native resource planning, double-entry accounting, inventory management, sales, purchasing, and ZATCA Phase 2 compliant e-invoicing platform designed specifically for the Kingdom of Saudi Arabia (KSA) regulatory and commercial ecosystem.

The system is engineered from day one for multi-tenancy, multi-branch, multi-warehouse operations, role-based access control (RBAC), multi-currency handling (SAR as base), and bidirectional Arabic (RTL) / English (LTR) language support.

## 2. Core Business Domains & Scope

### 2.1 Sales & Accounts Receivable (AR)
- **Quotations (عرض أسعار)**: Configurable validity, discount tiers, conversion into Sales Orders or Sales Invoices with audit traceability.
- **Sales Orders (أمر بيع)**: Inventory commitment, customer credit limit checks, fulfillment tracking.
- **Tax Invoices (فاتورة ضريبية B2B)**: Complete buyer VAT/CR information, mandatory Arabic/English fields, sequential tamper-proof numbering.
- **Simplified Tax Invoices (فاتورة ضريبية مبسطة B2C)**: Instant POS/counter issuance with ZATCA TLV Phase 2 QR codes.
- **Credit & Debit Notes (إشعارات دائنة ومدينة)**: Linked to original invoice reference with required ZATCA adjustment reasons.
- **Customer Receipts (سندات القبض)**: Cash, bank transfer, check, and electronic payment allocations against specific invoices or on account.
- **Customer Statements (كشف حساب عميل)**: Ledger-derived transaction history with running balances and aging buckets (0-30, 31-60, 61-90, 90+ days).

### 2.2 Purchasing & Accounts Payable (AP)
- **Purchase Orders (أمر شراء)**: Vendor commitments, expected delivery dates, landed cost estimates.
- **Purchase Bills / Vendor Invoices (فاتورة مشتريات)**: Input VAT verification, 15-digit Tax ID validation, matching against purchase orders and GRNs.
- **Supplier Payments (سندات الصرف)**: Single or multi-bill allocation, withholding tax support, disbursement journal linkage.
- **Debit Notes to Vendors (إشعار مدين للمورد)**: Return-to-vendor processing with stock deduction and AP reversal.
- **Supplier Statements (كشف حساب مورد)**: Ledger-derived balances, reconciliation schedules, and aging analysis.

### 2.3 Double-Entry Accounting & General Ledger (GL)
- **Standard Saudi Chart of Accounts (دليل الحسابات الموحد)**: Hierarchical account tree (Assets, Liabilities, Equity, Revenue, COGS, Operating Expenses, Other Income/Expenses, Tax Accounts).
- **Posting Engine (محرك الترحيل المالي)**: Atomicity, debit=credit invariants, unique idempotency keys, hash chaining.
- **Journal Entries (قيود اليومية)**: Manual adjustment journals, closing entries, recurring templates, reversing journals.
- **Financial Periods & Closing (الفترات المالية والإقفال)**: Monthly locks, fiscal year closing into Retained Earnings (الأرباح المبقاة), lock date overrides with audit.
- **Financial Reports (التقارير المالية)**: Trial Balance (ميزان المراجعة), Balance Sheet (قائمة المركز المالي), Income Statement / P&L (قائمة الدخل), Cash Flow Statement (قائمة التدفقات النقدية), General Ledger detail, Tax Returns (إقرار ضريبة القيمة المضافة).

### 2.4 Advanced Inventory & Warehousing
- **Item Master (بطاقة الصنف)**: Multi-category hierarchy, SKU, brand, serialization, batch/lot tracking, expiry tracking.
- **Multi-Unit of Measure (UOM) with Item-Specific Conversions**: Each item defines its own conversion ratios (e.g. 1 Carton = 12 Pieces for Item A; 1 Carton = 24 Pieces for Item B).
- **Unit-Specific Barcodes**: Unique barcode for each Item-Unit combination (Carton barcode vs. Piece barcode).
- **Weighted Average Cost (WAC - المتوسط المرجح للتكلفة)**: Real-time recalculation upon each purchase receipt / stock return.
- **Landed Cost Allocation (تكاليف الإنزال والشحن)**: Allocation of freight, customs, clearance, and insurance by quantity, value, weight, or custom ratio.
- **Warehouses & Branches**: Multi-location inventory balances, inter-warehouse transfers (تحويل بين المستودعات) with in-transit states.
- **Stock Adjustments & Stocktakes (الجرد والتسويات المخزنية)**: Cycle counting, physical inventory reconciliation, shrinkage write-offs with automatic GL posting.

### 2.5 Saudi VAT & ZATCA (FATOORA) Integration
- **VAT Rates**: 15% standard rate, 0% zero-rated, exempt, out-of-scope.
- **Phase 1 Compliance**: Tax identification, buyer/seller details, TLV QR code generation, standardized Arabic/English print templates.
- **Phase 2 Compliance Readiness**: UBL 2.1 XML schema compliance, SHA-256 cryptographic invoice hashing, previous invoice hash chaining (`PIH`), digital signature envelope, cryptographic stamp identifiers (CSID), compliance checks, clearance/reporting endpoints.

### 2.6 Multi-Tenancy & Multi-Branch Architecture
- Strict tenant data isolation via company scoping (`companyId`) across all queries, caches, and storage.
- User permission matrix by company, branch, and warehouse.
