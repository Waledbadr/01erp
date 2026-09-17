/**
 * Comprehensive System Documentation Registry — Saudi ERP
 * Contains metadata, categories, file paths, and full reference content for all 14 official docs.
 */

export interface SystemDoc {
  id: string;
  filename: string;
  category: 'core' | 'accounting' | 'inventory' | 'tax' | 'security' | 'ops' | 'guide';
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  badgeAr: string;
  badgeEn: string;
  keyRules: string[];
  content: string;
}

export const SYSTEM_DOCS: SystemDoc[] = [
  {
    id: 'project-spec',
    filename: 'PROJECT_SPEC.md',
    category: 'core',
    titleAr: 'مواصفات النظام العامة ونطاق الأعمال',
    titleEn: 'Project Specification & Business Scope',
    descAr: 'المعايير التنظيمية والتجارية السعودية، نطاق المبيعات، المشتريات، المخزون، والمحاسبة.',
    descEn: 'Saudi regulatory and commercial ecosystem, sales, purchasing, inventory, and accounting scope.',
    badgeAr: 'النطاق الشامل',
    badgeEn: 'Full Scope',
    keyRules: ['Multi-tenancy', 'B2B/B2C Invoices', 'Double-Entry GL', 'Multi-UOM', 'WAC Engine'],
    content: `# Saudi ERP & Business Management Platform — Project Specification

## 1. Executive Summary
The Saudi ERP & Business Management Platform is an enterprise-grade, cloud-native resource planning, double-entry accounting, inventory management, sales, purchasing, and ZATCA Phase 2 compliant e-invoicing platform designed specifically for the Kingdom of Saudi Arabia (KSA) regulatory and commercial ecosystem.

The system is engineered from day one for multi-tenancy, multi-branch, multi-warehouse operations, role-based access control (RBAC), multi-currency handling (SAR as base), and bidirectional Arabic (RTL) / English (LTR) language support.

## 2. Core Business Domains & Scope
- **Sales & AR**: Quotations, Sales Orders, Tax Invoices (B2B), Simplified Tax Invoices (B2C), Credit/Debit Notes, Customer Receipts, and Aging Statements.
- **Purchasing & AP**: Purchase Orders, Vendor Bills, 15-digit Tax ID validation, Landed Costs, Supplier Payments, and Debit Notes.
- **Double-Entry Accounting & GL**: Standard Saudi COA, Posting Engine (debits=credits), immutable journals, financial periods, and standard reports (Trial Balance, Balance Sheet, P&L, VAT return).
- **Advanced Inventory**: Item Master, Multi-UOM with item-specific conversions, unit-specific barcodes, perpetual WAC, Landed Cost allocation, and multi-warehouse transfers.
- **Saudi VAT & ZATCA**: 15% standard rate, zero-rated, exempt; Phase 1 TLV QR; Phase 2 UBL 2.1 XML, SHA-256 hash chaining (PIH), digital signatures, and asynchronous queuing.`
  },
  {
    id: 'accounting-rules',
    filename: 'ACCOUNTING_RULES.md',
    category: 'accounting',
    titleAr: 'القواعد المحاسبية الذهبية ومحرك الترحيل',
    titleEn: 'Golden Accounting Rules & Posting Engine',
    descAr: 'القواعد G1 إلى G8، دليل الحسابات السعودي الموحد، وعدم التلاعب بالقيود المالية.',
    descEn: 'Rules G1 to G8, standard Saudi Chart of Accounts, and immutable ledger posting engine.',
    badgeAr: 'معايير محاسبية صارمة',
    badgeEn: 'Accounting Invariants',
    keyRules: ['Rule G1: Debits = Credits', 'Rule G2: Immutable Entries', 'Rule G7: Fixed-Point Math', 'Rule G8: Line-Level Rounding'],
    content: `# Accounting Engine & Financial Rules — Saudi ERP

## 1. Golden Accounting Rules
### G1. The General Ledger Is the Sole Financial Source of Truth
No business module (Sales, Purchases, Cash, Inventory) may maintain an isolated financial balance that can diverge from the ledger. Every balance displayed on screen or reported to management is derived from or guaranteed to reconcile with the General Ledger.

Every posted journal entry must strictly satisfy:
$$\\sum \\text{Debits} = \\sum \\text{Credits}$$
Unbalanced journal submissions are rejected at both application and database constraint levels.

### G2. The Posting Engine Contract
All postings pass through \`GLPostingEngine.postJournal()\` with mandatory \`sourceKey\` idempotency, non-negative amounts, and immutable journal records. Reversals require an explicit opposite journal.

### G3. Standard Saudi Chart of Accounts (COA) Structure
Hierarchical 4-level numbering:
- 1000 - Assets (1100 Current Assets, 1110 Cash & Equivalents, 1120 AR, 1130 Inventory, 1140 Input VAT)
- 2000 - Liabilities (2100 Current Liabilities, 2110 AP, 2120 Output VAT, 2130 Accrued Payroll)
- 3000 - Equity (3110 Capital, 3120 Retained Earnings)
- 4000 - Revenue (4110 Sales Revenue, 4120 Service Revenue)
- 5000 - Cost of Goods Sold (5110 Inventory COGS)
- 6000 - Operating Expenses (6110 Salaries, 6120 Rent, 6130 Utilities)`
  },
  {
    id: 'inventory-rules',
    filename: 'INVENTORY_RULES.md',
    category: 'inventory',
    titleAr: 'قواعد المخزون والمتوسط المرجح والتسعير',
    titleEn: 'Inventory Rules, WAC & Barcode Identity',
    descAr: 'تسعير المخزون بالمتوسط المرجح WAC، تعدد الوحدات، الباركود لكل وحدة، وتكاليف الإنزال.',
    descEn: 'Perpetual WAC calculation, multi-UOM packaging, unit-specific barcodes, and landed costs.',
    badgeAr: 'إدارة المخزون والتكلفة',
    badgeEn: 'WAC & Barcodes',
    keyRules: ['Rule I1: Full Traceability', 'Rule I2: Perpetual WAC', 'Rule I3: Multi-Unit UOM', 'Rule I4: Unit-Specific Barcodes', 'Rule I5: Landed Costs'],
    content: `# Inventory Management & Valuation Rules — Saudi ERP

## 1. Golden Inventory Rules
### I1. Full Traceability & Zero Orphan Movements
Every inventory movement must link to a valid source document. Direct, unreferenced mutations to inventory balances are strictly forbidden.

### I2. Weighted Average Cost (WAC) Specification
Inventory valuation follows the perpetual Weighted Average Cost (WAC) method:
$$\\text{New WAC} = \\frac{(\\text{Current Qty} \\times \\text{Current WAC}) + (\\text{Incoming Qty} \\times \\text{Effective Unit Cost})}{\\text{Current Qty} + \\text{Incoming Qty}}$$

Row-level locking (\`SELECT ... FOR UPDATE\`) is enforced to prevent concurrent write race conditions.

### I3. Multi-Unit Packaging & Item-Specific Conversions
Every item has a primary Base Unit (Piece / Kilogram) and optional Secondary Units (Pack, Box, Carton) with item-specific conversion multipliers.

### I4. Barcode Identity Architecture
A barcode is bound to an \`(Item, Unit)\` tuple. Scanning a barcode automatically resolves both the item and quantity multiplier.`
  },
  {
    id: 'vat-zatca-rules',
    filename: 'VAT_ZATCA_RULES.md',
    category: 'tax',
    titleAr: 'ضريبة القيمة المضافة والفوترة الإلكترونية زاتكا',
    titleEn: 'Saudi VAT & ZATCA Phase 2 E-Invoicing',
    descAr: 'نسبة 15%، الفواتير الضريبية والمبسطة، ترميز TLV Base64، وسلسلة التجزئة PIH.',
    descEn: '15% VAT, standard/simplified invoices, TLV Base64 QR code, and PIH hash chaining.',
    badgeAr: 'هيئة الزكاة والضريبة',
    badgeEn: 'ZATCA Compliant',
    keyRules: ['Standard Rate 15%', '15-digit VAT ID (starts/ends with 3)', 'TLV QR Tags 1-9', 'SHA-256 Hash Chaining (PIH)', 'Asynchronous Queue'],
    content: `# Saudi VAT & ZATCA (FATOORA) E-Invoicing Rules

## 1. Saudi Value Added Tax (VAT) Specifications
- Standard Rate (15%): General rate on taxable goods and services.
- Zero-Rated (0%): Qualifying exports, qualifying medicines, international transport.
- Exempt: Specified financial services, residential lease.
- Out of Scope: Government statutory charges.

## 2. ZATCA Document Classifications
- Standard Tax Invoice (388): B2B/B2G transactions with buyer VAT/CR and clearance.
- Simplified Tax Invoice (388-02): B2C retail transactions with mandatory TLV QR code.
- Credit Note (381) & Debit Note (383): References original invoice UUID with ZATCA adjustment reasons.

## 3. ZATCA Phase 1 & 2 QR Code Structure
TLV Tags:
- Tag 1: Seller Name
- Tag 2: Seller VAT Registration Number (15 digits, starting and ending with 3)
- Tag 3: Invoice Timestamp in ISO 8601 UTC
- Tag 4: Invoice Total with VAT
- Tag 5: Total VAT Amount
- Tag 6: SHA-256 Invoice Hash
- Tag 7: ECDSA Digital Signature
- Tag 8: ECDSA Public Key`
  },
  {
    id: 'architecture',
    filename: 'ARCHITECTURE.md',
    category: 'core',
    titleAr: 'معمارية النظام والطبقات البرمجية',
    titleEn: 'System Architecture & Technical Topology',
    descAr: 'طوبولوجيا الطبقات، عزل المستأجرين، محركات الأعمال، ونموذج التخزين العلائقي.',
    descEn: 'Layer topology, tenant isolation, core business engines, and relational persistence.',
    badgeAr: 'بنية تحتية موحدة',
    badgeEn: 'Unified Topology',
    keyRules: ['Unified Port 3000 Ingress', 'React 19 SPA + Express', 'PostgreSQL / Drizzle', 'Async Job Queue'],
    content: `# System Architecture — Saudi ERP & Business Management Platform

## 1. High-Level Architectural Overview
- Client Browser: React 19 + Vite + Tailwind CSS v4 + Lucide Icons (Native RTL/LTR).
- Application & Service Layer: Node.js / Express unified server on port 3000.
- Core Business Engines: Posting Engine, Inventory Engine (WAC), ZATCA E-Invoice Engine, Payment Allocation Engine, Landed Cost Engine, and VAT Engine.
- Data Access & Transaction Boundary: ACID transactions, row-level locking (\`FOR UPDATE\`), idempotency enforcers, and audit log writer.
- Persistence: PostgreSQL relational database with Drizzle ORM schema declarations.`
  },
  {
    id: 'decisions',
    filename: 'DECISIONS.md',
    category: 'core',
    titleAr: 'سجل القرارات المعمارية (ADRs)',
    titleEn: 'Architecture Decision Records (ADRs)',
    descAr: 'توثيق القرارات المعمارية من ADR-001 إلى ADR-008 ومبرراتها ونتائجها التقنية.',
    descEn: 'Architectural decisions from ADR-001 to ADR-008 with context, decisions, and consequences.',
    badgeAr: 'قرارات ملزمة',
    badgeEn: 'ADR Catalog',
    keyRules: ['ADR-001: Port 3000 Ingress', 'ADR-002: Drizzle/Postgres', 'ADR-003: Fixed-Precision Math', 'ADR-004: Immutable Posting', 'ADR-007: Decoupled ZATCA'],
    content: `# Architecture Decision Records (ADRs) — DECISIONS.md

- ADR-001: Runtime Platform & Single Port 3000 Ingress
- ADR-002: Relational Schema & ORM Model (Drizzle / PostgreSQL)
- ADR-003: Fixed-Precision Financial Mathematics (Rule G7)
- ADR-004: Centralized Immutable Posting Engine (Rules G1, G2)
- ADR-005: Item-Unit-Specific Barcode & Conversion Architecture (Rules I1, I4)
- ADR-006: Weighted Average Cost (WAC) with Serialized Row Locking (Rule I2)
- ADR-007: ZATCA Phase 2 E-Invoicing Internal Architecture (Decoupled Submission)
- ADR-008: Native Bidirectional Localization (Arabic RTL First, English LTR Instant Toggle)`
  },
  {
    id: 'security',
    filename: 'SECURITY.md',
    category: 'security',
    titleAr: 'الأمان، عزل المستأجرين وسجل التدقيق',
    titleEn: 'Security, Multi-Tenancy & Audit Trail',
    descAr: 'مصفوفة الصلاحيات RBAC، عزل بيانات الشركات، حجب التكاليف عن المناديب، وسجلات التدقيق.',
    descEn: 'RBAC permissions matrix, company data isolation, cost masking for sales reps, and insert-only audit logs.',
    badgeAr: 'حماية وعزل كامل',
    badgeEn: 'Zero Data Leakage',
    keyRules: ['Non-nullable company_id', 'RBAC Matrix', 'Cost Field Masking', 'Insert-only Audit Log', 'Dangerous Operations Confirmation'],
    content: `# Security, Access Control & Audit Architecture — Saudi ERP

## 1. Multi-Tenant Isolation
- Every business table contains indexed, non-nullable \`company_id\`.
- Context guard middleware injects verified \`tenantContext\` from session token.
- Zero reliance on frontend authorization; backend enforces checks on every mutation and query.

## 2. Role-Based Access Control (RBAC)
Roles: Super Admin, Branch Admin, Chief Accountant, Accountant, Sales Rep, Warehouse Keeper, Auditor/Viewer.
Field-Level Masking: Sales representatives are explicitly masked from viewing purchase costs and supplier profit margins.

## 3. Immutable Audit Trail
Insert-only \`audit_logs\` table capturing user, action, entity, before/after snapshot, IP, and timestamp.`
  },
  {
    id: 'api',
    filename: 'API.md',
    category: 'ops',
    titleAr: 'دليل واجهات برمجة التطبيقات (REST API)',
    titleEn: 'REST API Specification & Endpoints',
    descAr: 'معايير الطلب والاستجابة، رموز الأخطاء الثنائية اللغة، مفاتيح الإعادة Idempotency.',
    descEn: 'Request/response conventions, bilingual error envelopes, and idempotency headers.',
    badgeAr: 'توثيق الـ API',
    badgeEn: 'REST v1',
    keyRules: ['Base URL /api/v1', 'Idempotency-Key Header', 'Bilingual Error Envelopes', 'Audit Logged Endpoints'],
    content: `# REST API Specification — Saudi ERP

## 1. Conventions & Standards
- Base URL: \`/api/v1\`
- Content Type: \`application/json; charset=utf-8\`
- Authentication: Bearer Token via \`Authorization: Bearer <token>\`
- Tenant Context: Injected via session token and optional \`X-Company-Id\` header.
- Idempotency: All mutation endpoints support \`Idempotency-Key: <UUID>\`.

## 2. Standard Response Envelope
Success (\`200 OK\`, \`201 Created\`):
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 25, "total": 1420 }
}
\`\`\`

Error (\`400\`, \`401\`, \`403\`, \`422\`, \`500\`):
\`\`\`json
{
  "success": false,
  "error": {
    "code": "JOURNAL_UNBALANCED",
    "message": "Total debits do not equal total credits.",
    "messageAr": "إجمالي المدين لا يساوي إجمالي الدائن.",
    "correlationId": "req-99f8a2-3b10"
  }
}
\`\`\``
  },
  {
    id: 'testing',
    filename: 'TESTING.md',
    category: 'ops',
    titleAr: 'استراتيجية الاختبارات وضمان الجودة',
    titleEn: 'Testing Strategy & Quality Assurance',
    descAr: 'هرم الاختبارات، اختبارات القيود المحاسبية، فحص WAC، والتحقق من زاتكا.',
    descEn: 'Testing pyramid, accounting invariants, WAC test cases, and ZATCA compliance tests.',
    badgeAr: 'جودة واختبارات',
    badgeEn: 'QA Strategy',
    keyRules: ['Unit Tests', 'Integration DB Tests', 'E2E Playwright Workflows', 'Zero Regressions'],
    content: `# Testing Strategy & Quality Assurance — Saudi ERP

## 1. Testing Pyramid
- Unit Tests: VAT arithmetic, decimal math, TLV QR, landed cost algorithms.
- Integration Tests: DB transactions, posting engine invariants, WAC mutex row-locking.
- E2E User Journeys: Playwright critical sales-to-ledger and procurement workflows.

## 2. Core Test Suites
- Accounting: Unbalanced lines rejection, idempotency duplicate submission, period closing guards.
- Inventory: Multi-receipt WAC recalculation, multi-unit conversions, negative stock rejection.
- ZATCA: Rounding half-up, TLV encoding, hash chaining (PIH).`
  },
  {
    id: 'deployment',
    filename: 'DEPLOYMENT.md',
    category: 'ops',
    titleAr: 'دليل النشر والبنية التحتية السحابية',
    titleEn: 'Deployment & Infrastructure Guide',
    descAr: 'بيئة Cloud Run، البورت 3000، بناء الإنتاج وسير العمليات.',
    descEn: 'Cloud Run environment, port 3000 constraints, production build, and health checks.',
    badgeAr: 'جاهز للنشر',
    badgeEn: 'Cloud Run Ready',
    keyRules: ['Port 3000 Ingress', 'Unified dist/server.cjs', 'Health check /api/health', 'Graceful Shutdown'],
    content: `# Deployment & Infrastructure Guide — Saudi ERP

## 1. Cloud Run Container Environment
- Port: 3000 (platform reverse proxy constraint).
- Host: 0.0.0.0.
- Process Model: Express serving both API endpoints under \`/api/v1\` and React SPA from \`dist/\`.

## 2. Build Pipeline
\`npm run build\`:
1. \`vite build\`: Compiles React SPA into \`dist/\`.
2. \`esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs\`: Bundles server into CommonJS production artifact.`
  },
  {
    id: 'backups',
    filename: 'BACKUPS.md',
    category: 'ops',
    titleAr: 'النسخ الاحتياطي واستعادة البيانات والاحتفاظ',
    titleEn: 'Backup, Disaster Recovery & Data Retention',
    descAr: 'النسخ اللحظي PITR، الاحتفاظ 6 سنوات وفق متطلبات الزكاة، وضمانات الاسترجاع.',
    descEn: 'Point-in-time recovery (PITR), 6-year ZATCA data retention, and restoration drills.',
    badgeAr: 'أمان البيانات',
    badgeEn: 'Disaster Recovery',
    keyRules: ['Continuous PITR (7 days)', 'Daily Snapshots', '6 Years ZATCA Retention', 'Automated Weekly Drill'],
    content: `# Backup, Disaster Recovery & Data Retention — Saudi ERP

## 1. Backup Tiers
1. Continuous Point-in-Time Recovery (PITR): WAL archiving for 7-day granular recovery.
2. Daily Automated Snapshots: 24h interval snapshots retained for 30 days.
3. Monthly Archival Backups: Permanent fiscal close snapshots retained for 6+ years as required by Saudi commercial and tax law.`
  },
  {
    id: 'user-guide-ar',
    filename: 'USER_GUIDE_AR.md',
    category: 'guide',
    titleAr: 'دليل المستخدم باللغة العربية',
    titleEn: 'Arabic User Guide (دليل المستخدم العربي)',
    descAr: 'شرح تفصيلي لكافة وظائف المبيعات، المشتريات، المخزون، والقيود المحاسبية للمستخدم النهائي.',
    descEn: 'End-user operational guide in Arabic covering sales, procurement, inventory, and ledger.',
    badgeAr: 'دليل تشغيلي شامل',
    badgeEn: 'Arabic Guide',
    keyRules: ['خطوات الفاتورة الضريبية', 'إشعارات الدائن والمدين', 'توزيع مصاريف الشحن', 'الجرد والترحيل'],
    content: `# دليل المستخدم — نظام إدارة الأعمال وتخطيط الموارد السحابي (Saudi ERP)

## لوحة التحكم والواجهة الرئيسية
- دعم كامل للغة العربية (RTL) واللغة الإنجليزية (LTR) مع إمكانية التبديل الفوري.
- مؤشرات الأداء اللحظية: المبيعات والمشتريات، الرصيد النقدي والبنكي، والذمم المدينة والدائنة.

## إدارة المبيعات والفوترة الإلكترونية (ZATCA)
- إنشاء الفاتورة الضريبية (B2B) والفاتورة المبسطة (B2C).
- التحقق التلقائي من الرقم الضريبي وإصدار رمز الاستجابة السريعة (TLV QR).
- إشعارات الدائن والمدين وربطها برقم الفاتورة الأصلية.

## إدارة المشتريات والمخزون
- تسجيل فواتير الموردين وتوزيع تكاليف الشحن والجمارك (Landed Cost).
- احتساب المتوسط المرجح للتكلفة (WAC) آلياً.
- سندات القبض وسندات الصرف وكشوفات الحساب وأعمار الديون.`
  },
  {
    id: 'user-guide-en',
    filename: 'USER_GUIDE_EN.md',
    category: 'guide',
    titleAr: 'دليل المستخدم باللغة الإنجليزية',
    titleEn: 'English User Guide',
    descAr: 'إرشادات التشغيل باللغة الإنجليزية لكافة الوحدات والتقارير المالية والضريبية.',
    descEn: 'End-user operational guide in English covering sales, procurement, inventory, and ledger.',
    badgeAr: 'دليل تشغيلي',
    badgeEn: 'English Guide',
    keyRules: ['B2B/B2C Workflow', 'Credit/Debit Notes', 'WAC Recalculation', 'Financial Reports'],
    content: `# User Guide — Saudi Cloud ERP & Business Management Platform

## 1. System Navigation & Language Switching
- Instant bidirectional toggle between Arabic (RTL) and English (LTR).
- Top navigation provides company context, active branch, and user profile controls.

## 2. Sales & E-Invoicing (ZATCA Phase 2)
- Standard Tax Invoices (B2B): Requires buyer Tax ID and National Address.
- Simplified Tax Invoices (B2C): Instant POS issuance with compliant TLV QR code.
- Automatic GL posting upon confirmation (AR Debit, Revenue & Output VAT Credit).

## 3. Purchasing & Inventory
- Vendor Bills with 15-digit Tax ID validation.
- Landed Cost distribution by value or quantity.
- Perpetual Weighted Average Cost (WAC) recalculation.`
  },
  {
    id: 'phase-status',
    filename: 'PHASE_STATUS.md',
    category: 'ops',
    titleAr: 'سجل تتبع مراحل التنفيذ والإنجاز',
    titleEn: 'Phase Implementation Status Matrix',
    descAr: 'متابعة تفصيلية للمراحل من المرحلة 00 إلى المرحلة 12 ومعايير الإنجاز والاختبارات.',
    descEn: 'Tracking progress and completion criteria for all implementation phases from 00 to 12.',
    badgeAr: 'مصفوفة الإنجاز',
    badgeEn: 'Status Matrix',
    keyRules: ['Phase 00: COMPLETE', 'Phases 01-12 Roadmap', 'Adversarial QA Criteria'],
    content: `# Implementation Phase Status Tracking — PHASE_STATUS.md

Phase Overview Matrix:
- PHASE-00: Discovery, Architecture, Documentation & Setup (COMPLETE)
- PHASE-01: Multi-Tenancy, Auth, RBAC & Company Master
- PHASE-02: Chart of Accounts & Core Double-Entry Posting Engine
- PHASE-03: Product Master, Multi-UOM, Barcodes & Warehouses
- PHASE-04: Sales Lifecycle, Standard & Simplified Invoices
- PHASE-05: ZATCA Phase 2 E-Invoicing Engine & TLV QR
- PHASE-06: Purchasing, Bills, Landed Costs & Supplier Master
- PHASE-07: Inventory Movements, WAC Recalculation & Transfers
- PHASE-08: Cash/Bank Accounts, Receipts & Payment Allocations
- PHASE-09: AR/AP Statements, Aging Schedules & Reconciliations
- PHASE-10: Financial Statements (Trial Balance, P&L, Balance Sheet) & VAT Return
- PHASE-11: Audit Trail, Security Hardening, Backup & Restore
- PHASE-12: E2E Integration, Performance, Polish & Production Readiness`
  },
];
