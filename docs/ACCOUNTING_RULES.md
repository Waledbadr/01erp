# Accounting Engine & Financial Rules — Saudi ERP

## 1. Core Principles (Golden Accounting Rules)

### G1. The General Ledger Is the Sole Financial Source of Truth
No business module (Sales, Purchases, Cash, Inventory) may maintain an isolated financial balance that can diverge from the ledger. Every balance displayed on screen or reported to management is derived from or guaranteed to reconcile with the General Ledger.

Every posted journal entry must strictly satisfy:
$$\sum \text{Debits} = \sum \text{Credits}$$
Unbalanced journal submissions are rejected at both application and database constraint levels.

### G2. The Posting Engine Contract
The central posting engine interface:
```typescript
interface PostJournalCommand {
  companyId: string;
  branchId: string;
  sourceType: 'INVOICE' | 'BILL' | 'RECEIPT' | 'PAYMENT' | 'JOURNAL' | 'INVENTORY_ADJUSTMENT' | 'EXPENSE';
  sourceId: string;
  sourceKey: string; // Unique idempotency key (e.g. "INV:2026:0001:POST")
  entryDate: string; // YYYY-MM-DD
  description: string;
  descriptionAr: string;
  lines: Array<{
    accountId: string;
    debit: string; // Decimal string e.g. "1150.00"
    credit: string; // Decimal string e.g. "0.00"
    costCenterId?: string;
    partnerId?: string;
    description?: string;
  }>;
  metadata?: Record<string, unknown>;
}
```

#### Invariants Enforced:
1. Total debits strictly equal total credits.
2. The `sourceKey` must be unique per company. Duplicate calls return the existing journal entry without creating duplicate records.
3. The posting date must belong to an open financial period.
4. Entries are immutable once created. Any correction requires a full reversal journal (`sourceType: 'REVERSAL'`).

### G3. Standard Saudi Chart of Accounts (COA) Structure
The platform utilizes a structured 4-level account numbering hierarchy:
- **1000 - الأصول (Assets)**
  - 1100 الأصول المتداولة (Current Assets)
    - 1110 النقد وما في حكمه (Cash & Equivalents)
      - 1111 الصندوق الرئيسي (Main Cash Drawer)
      - 1112 حسابات البنوك (Bank Accounts - Al Rajhi, SNB, Riyad)
    - 1120 المدينون التجاريون (Accounts Receivable - Customers)
    - 1130 المخزون (Merchandise Inventory)
    - 1140 ضريبة القيمة المضافة المدخلة (Input VAT Recoverable)
    - 1150 مصروفات مدفوعة مقدماً (Prepaid Expenses)
  - 1200 الأصول غير المتداولة (Non-Current Assets / Fixed Assets)
- **2000 - الالتزامات (Liabilities)**
  - 2100 الالتزامات المتداولة (Current Liabilities)
    - 2110 الدائنون التجاريون (Accounts Payable - Suppliers)
    - 2120 ضريبة القيمة المضافة المخرجة (Output VAT Payable)
    - 2130 مستحقات موظفين ومصروفات مستحقة (Accrued Expenses & Payroll)
- **3000 - حقوق الملكية (Equity)**
  - 3110 رأس المال (Paid-in Capital)
  - 3120 الأرباح المبقاة (Retained Earnings)
  - 3130 جاري الشركاء (Partners Current Accounts)
- **4000 - الإيرادات (Revenue)**
  - 4110 إيرادات المبيعات (Sales Revenue - Standard 15%)
  - 4120 إيرادات مبيعات خاضعة للنسبة الصفرية (Zero-Rated Sales)
  - 4130 إيرادات معفاة من الضريبة (Exempt Sales)
- **5000 - تكلفة المبيعات (Cost of Goods Sold - COGS)**
  - 5110 تكلفة البضاعة المباعة (Cost of Goods Sold)
  - 5120 تسويات وفروقات المخزون (Inventory Adjustments / Variance)
- **6000 - المصروفات التشغيلية (Operating Expenses)**
  - 6110 الرواتب والأجور (Salaries & Wages)
  - 6120 الإيجار (Rent Expense)
  - 6130 فواتير الكهرباء والمياه والاتصالات (Utilities)
  - 6140 مصاريف بنكية ورسوم دفع إلكتروني (Bank & Payment Processing Fees)

### G4. Standard Posting Templates

#### 1. Standard Sales Invoice (100 SAR Net + 15% VAT = 115 SAR):
- **Dr.** Accounts Receivable (1120): `115.00 SAR`
- **Cr.** Sales Revenue (4110): `100.00 SAR`
- **Cr.** Output VAT Payable (2120): `15.00 SAR`
- *Accompanying Inventory Movement (WAC Cost = 70 SAR):*
  - **Dr.** Cost of Goods Sold (5110): `70.00 SAR`
  - **Cr.** Merchandise Inventory (1130): `70.00 SAR`

#### 2. Customer Receipt (Cash/Bank):
- **Dr.** Cash / Bank (1111/1112): `115.00 SAR`
- **Cr.** Accounts Receivable (1120): `115.00 SAR`

#### 3. Standard Purchase Bill (200 SAR Net + 15% VAT = 230 SAR):
- **Dr.** Merchandise Inventory (1130): `200.00 SAR`
- **Dr.** Input VAT Recoverable (1140): `30.00 SAR`
- **Cr.** Accounts Payable (2110): `230.00 SAR`

#### 4. Supplier Payment:
- **Dr.** Accounts Payable (2110): `230.00 SAR`
- **Cr.** Bank Account (1112): `230.00 SAR`

### G5. Payment Allocation Engine
- Payments support both unallocated deposits ("on account") and specific invoice matching.
- An allocation record links `Payment` to `Invoice` with exact allocated amount.
- Allocation strategies:
  1. Manual allocation by user selection.
  2. FIFO: Oldest unpaid invoices allocated first.
  3. Pro-rata distribution across selected invoices.
- Unallocated funds remain visible as an unallocated credit on the customer's ledger balance until matched.

### G6. Customer and Supplier Statements
- Statements are computed by querying the general ledger lines for the partner's AR/AP account:
  $$\text{Closing Balance} = \text{Opening Balance} + \sum \text{Debit Transactions} - \sum \text{Credit Transactions}$$
- Every line includes: Date, Document Number, Document Type, Reference, Debit, Credit, Running Balance.
- Aging schedule divides outstanding unpaid balances into buckets: Current, 1-30 Days, 31-60 Days, 61-90 Days, 90+ Days.
