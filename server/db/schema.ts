import { pgTable, uuid, text, timestamp, boolean, bigint, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ==========================================
// 1. TENANTS & MULTI-TENANCY CORE
// ==========================================
export const tenantsTable = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // e.g. TNT-1001
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  vatNumber: text('vat_number').notNull(), // 15-digit Saudi VAT ID
  crNumber: text('cr_number').notNull(), // 10-digit Commercial Registration
  nationalAddress: text('national_address').notNull(),
  isSuspended: boolean('is_suspended').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const branchesTable = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  code: text('code').notNull(), // e.g. BR-01
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  isMainBranch: boolean('is_main_branch').default(false).notNull(),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('branches_tenant_idx').on(table.tenantId),
  uniqueIndex('branches_tenant_code_idx').on(table.tenantId, table.code),
]);

export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  branchId: uuid('branch_id').references(() => branchesTable.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  fullNameAr: text('full_name_ar').notNull(),
  fullNameEn: text('full_name_en').notNull(),
  role: text('role').notNull(), // OWNER, CHIEF_ACCOUNTANT, ACCOUNTANT, SALES_MGR, CASHIER, WAREHOUSE_MGR, AUDITOR
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('users_tenant_idx').on(table.tenantId),
  uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email),
]);

// ==========================================
// 2. CHART OF ACCOUNTS & GENERAL LEDGER (G1-G8)
// ==========================================
export const accountsTable = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id), // Nullable for system-wide defaults
  code: text('code').notNull(), // 10101, 20101, etc.
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  type: text('type').notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE
  normalBalance: text('normal_balance').notNull(), // DEBIT, CREDIT
  parentId: uuid('parent_id'),
  isHeader: boolean('is_header').default(false).notNull(),
  allowPosting: boolean('allow_posting').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('accounts_tenant_idx').on(table.tenantId),
  uniqueIndex('accounts_tenant_code_idx').on(table.tenantId, table.code),
]);

export const journalEntriesTable = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  branchId: uuid('branch_id').references(() => branchesTable.id).notNull(),
  entryNumber: text('entry_number').notNull(), // Sequential JV-YYYY-XXXXX
  entryDate: text('entry_date').notNull(), // YYYY-MM-DD
  periodId: text('period_id').notNull(),
  sourceType: text('source_type').notNull(), // INVOICE, PAYMENT, RECEIPT, BILL, INVENTORY, MANUAL
  sourceId: text('source_id').notNull(),
  sourceKey: text('source_key').notNull(), // Idempotency token
  descriptionAr: text('description_ar').notNull(),
  descriptionEn: text('description_en').notNull(),
  totalDebitCents: bigint('total_debit_cents', { mode: 'bigint' }).notNull(),
  totalCreditCents: bigint('total_credit_cents', { mode: 'bigint' }).notNull(),
  status: text('status').default('POSTED').notNull(), // POSTED, REVERSED
  reversalOfJournalId: uuid('reversal_of_journal_id'),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('journals_tenant_idx').on(table.tenantId),
  uniqueIndex('journals_idempotency_idx').on(table.tenantId, table.sourceType, table.sourceId, table.sourceKey),
]);

export const journalLinesTable = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalId: uuid('journal_id').references(() => journalEntriesTable.id).notNull(),
  accountId: uuid('account_id').references(() => accountsTable.id).notNull(),
  debitCents: bigint('debit_cents', { mode: 'bigint' }).notNull(),
  creditCents: bigint('credit_cents', { mode: 'bigint' }).notNull(),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  costCenterId: text('cost_center_id'),
}, (table) => [
  index('journal_lines_journal_idx').on(table.journalId),
  index('journal_lines_account_idx').on(table.accountId),
]);

// ==========================================
// 3. SYSTEM MASTERS: TAX, UNITS & DOC TYPES
// ==========================================
export const taxRatesTable = pgTable('tax_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id),
  code: text('code').notNull(), // VAT_15, VAT_0, EXEMPT, OUT_OF_SCOPE
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  ratePercentage: integer('rate_percentage').notNull(), // 15, 0
  taxCategoryCode: text('tax_category_code').notNull(), // S, Z, E, O (UN/ECE 5305)
  isSystemDefault: boolean('is_system_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const unitsOfMeasureTable = pgTable('units_of_measure', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id),
  code: text('code').notNull(), // PCS, BOX, CTN, KG, G, M, LTR
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  symbolAr: text('symbol_ar').notNull(),
  symbolEn: text('symbol_en').notNull(),
  isSystemDefault: boolean('is_system_default').default(false).notNull(),
});

export const documentTypesTable = pgTable('document_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // STD_INV, SMP_INV, CR_NOTE, DB_NOTE
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  zatcaInvoiceTypeCode: text('zatca_invoice_type_code').notNull(), // 388, 383, 381
  zatcaInvoiceSubtype: text('zatca_invoice_subtype').notNull(), // 0100000 (Standard), 0200000 (Simplified)
});

// ==========================================
// 4. IMMUTABLE AUDIT LOG (SECURITY & COMPLIANCE)
// ==========================================
export const auditLogsTable = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  userId: uuid('user_id'),
  userEmail: text('user_email').notNull(),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent'),
  action: text('action').notNull(), // e.g. POST_JOURNAL, LOGIN_SUCCESS
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  changesDiff: jsonb('changes_diff'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_logs_tenant_idx').on(table.tenantId),
  index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  index('audit_logs_correlation_idx').on(table.correlationId),
]);

// ==========================================
// 5. FINANCIAL PERIODS & FISCAL YEARS (PHASE-02)
// ==========================================
export const fiscalYearsTable = pgTable('fiscal_years', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  year: integer('year').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  startDate: text('start_date').notNull(), // YYYY-MM-DD
  endDate: text('end_date').notNull(), // YYYY-MM-DD
  isClosed: boolean('is_closed').default(false).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('fiscal_years_tenant_idx').on(table.tenantId),
  uniqueIndex('fiscal_years_tenant_year_idx').on(table.tenantId, table.year),
]);

export const financialPeriodsTable = pgTable('financial_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  fiscalYearId: uuid('fiscal_year_id').references(() => fiscalYearsTable.id).notNull(),
  periodNumber: integer('period_number').notNull(), // 1 to 12
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  startDate: text('start_date').notNull(), // YYYY-MM-DD
  endDate: text('end_date').notNull(), // YYYY-MM-DD
  isClosed: boolean('is_closed').default(false).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => usersTable.id),
  closedReason: text('closed_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('periods_tenant_idx').on(table.tenantId),
  index('periods_year_idx').on(table.fiscalYearId),
  uniqueIndex('periods_tenant_year_num_idx').on(table.tenantId, table.fiscalYearId, table.periodNumber),
]);

// ==========================================
// 6. COST CENTERS (PHASE-02 SCHEMA & INTEGRATION)
// ==========================================
export const costCentersTable = pgTable('cost_centers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  code: text('code').notNull(), // CC-01
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cost_centers_tenant_idx').on(table.tenantId),
  uniqueIndex('cost_centers_code_idx').on(table.tenantId, table.code),
]);

// ==========================================
// 7. OPENING BALANCES & DRAFT JOURNALS
// ==========================================
export const openingBalancesTable = pgTable('opening_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  sourceType: text('source_type').notNull(), // CUSTOMER, SUPPLIER, CASHBOX, BANK, INVENTORY, GL
  sourceId: text('source_id').notNull(),
  sourceNameAr: text('source_name_ar').notNull(),
  sourceNameEn: text('source_name_en').notNull(),
  accountId: uuid('account_id').references(() => accountsTable.id).notNull(),
  accountCode: text('account_code').notNull(),
  debitCents: bigint('debit_cents', { mode: 'bigint' }).default(0n).notNull(),
  creditCents: bigint('credit_cents', { mode: 'bigint' }).default(0n).notNull(),
  itemizedReference: text('itemized_reference'), // invoice # or reference
  notes: text('notes'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, POSTED
  postedJournalId: uuid('posted_journal_id').references(() => journalEntriesTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('opening_balances_tenant_idx').on(table.tenantId),
  index('opening_balances_source_idx').on(table.tenantId, table.sourceType),
]);

export const draftJournalsTable = pgTable('draft_journals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  branchId: uuid('branch_id').references(() => branchesTable.id).notNull(),
  entryDate: text('entry_date').notNull(),
  descriptionAr: text('description_ar').notNull(),
  descriptionEn: text('description_en').notNull(),
  reference: text('reference'),
  lines: jsonb('lines').notNull(), // Array of draft lines
  attachments: jsonb('attachments'),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('draft_journals_tenant_idx').on(table.tenantId),
]);

// ==========================================
// 8. CUSTOMERS & RECEIVABLES MASTER (PHASE-03 / 04)
// ==========================================
export const customersTable = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  code: text('code').notNull(), // CUST-0001
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  type: text('type').notNull(), // INDIVIDUAL, ESTABLISHMENT, COMPANY, GOVERNMENT, FOREIGN
  vatNumber: text('vat_number'),
  crNumber: text('cr_number'),
  unifiedNumber: text('unified_number'),
  mobile: text('mobile').notNull(),
  email: text('email'),
  address: jsonb('address').notNull(),
  paymentTerms: text('payment_terms').notNull(), // IMMEDIATE, NET_15, NET_30, NET_60, NET_90, EOM_30, CUSTOM
  customPaymentDays: integer('custom_payment_days'),
  creditLimit: integer('credit_limit').default(0).notNull(), // in SAR
  creditHold: boolean('credit_hold').default(false).notNull(),
  cashOnly: boolean('cash_only').default(false).notNull(),
  salesRepId: uuid('sales_rep_id'),
  salesRepName: text('sales_rep_name'),
  accountManagerId: uuid('account_manager_id'),
  accountManagerName: text('account_manager_name'),
  customerGroup: text('customer_group').notNull(), // RETAIL, WHOLESALE, VIP, KEY_ACCOUNT, GOVERNMENT
  priceList: text('price_list').notNull(), // RETAIL, WHOLESALE, DISTRIBUTOR, SPECIAL
  defaultDiscountPercent: integer('default_discount_percent').default(0).notNull(),
  taxCategory: text('tax_category').notNull(), // STANDARD_15, ZERO_RATED, EXEMPT, OUT_OF_SCOPE
  status: text('status').default('ACTIVE').notNull(), // ACTIVE, SUSPENDED, ARCHIVED
  subaccountId: uuid('subaccount_id').references(() => accountsTable.id).notNull(),
  subaccountCode: text('subaccount_code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('customers_tenant_idx').on(table.tenantId),
  uniqueIndex('customers_tenant_code_idx').on(table.tenantId, table.code),
  index('customers_tenant_vat_idx').on(table.tenantId, table.vatNumber),
  index('customers_tenant_cr_idx').on(table.tenantId, table.crNumber),
  index('customers_tenant_mobile_idx').on(table.tenantId, table.mobile),
]);

// ==========================================
// 9. SUPPLIERS & PAYABLES MASTER (PHASE-03 / 04)
// ==========================================
export const suppliersTable = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  code: text('code').notNull(), // SUPP-0001
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  type: text('type').notNull(), // COMPANY, ESTABLISHMENT, INDIVIDUAL, GOVERNMENT, FOREIGN
  supplierType: text('supplier_type').notNull(), // LOCAL, INTERNATIONAL, NON_VAT
  vatNumber: text('vat_number'),
  crNumber: text('cr_number'),
  unifiedNumber: text('unified_number'),
  mobile: text('mobile').notNull(),
  email: text('email'),
  address: jsonb('address').notNull(),
  supplierGroup: text('supplier_group').notNull(), // RAW_MATERIALS, COMMODITIES, SERVICES, IMPORTERS, LOGISTICS
  taxCategory: text('tax_category').notNull(), // STANDARD_15, ZERO_RATED, EXEMPT, OUT_OF_SCOPE
  paymentTerms: text('payment_terms').notNull(), // IMMEDIATE, NET_15, NET_30, NET_60, NET_90, EOM_30, CUSTOM
  customPaymentDays: integer('custom_payment_days'),
  creditLimit: integer('credit_limit').default(0).notNull(),
  status: text('status').default('ACTIVE').notNull(), // ACTIVE, SUSPENDED, ARCHIVED
  subaccountId: uuid('subaccount_id').references(() => accountsTable.id).notNull(),
  subaccountCode: text('subaccount_code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('suppliers_tenant_idx').on(table.tenantId),
  uniqueIndex('suppliers_tenant_code_idx').on(table.tenantId, table.code),
  index('suppliers_tenant_vat_idx').on(table.tenantId, table.vatNumber),
  index('suppliers_tenant_cr_idx').on(table.tenantId, table.crNumber),
  index('suppliers_tenant_mobile_idx').on(table.tenantId, table.mobile),
]);

// ==========================================
// 10. PARTY ATTACHMENTS & CONTRACTS
// ==========================================
export const partyAttachmentsTable = pgTable('party_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  partyType: text('party_type').notNull(), // CUSTOMER, SUPPLIER
  partyId: uuid('party_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // CR_COPY, VAT_CERTIFICATE, CONTRACT, BANK_LETTER, OTHER
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  url: text('url'),
  uploadedBy: uuid('uploaded_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('party_attachments_tenant_party_idx').on(table.tenantId, table.partyId),
]);

export const partyContractsTable = pgTable('party_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliersTable.id).notNull(),
  contractNumber: text('contract_number').notNull(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  valueSar: integer('value_sar').default(0).notNull(),
  attachmentId: uuid('attachment_id'),
  status: text('status').default('ACTIVE').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('party_contracts_tenant_idx').on(table.tenantId),
  index('party_contracts_supplier_idx').on(table.supplierId),
]);

export const supplierPriceHistoryTable = pgTable('supplier_price_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliersTable.id).notNull(),
  itemId: uuid('item_id').notNull(),
  itemSku: text('item_sku').notNull(),
  itemNameAr: text('item_name_ar').notNull(),
  unitPriceSar: integer('unit_price_sar').notNull(),
  recordedFrom: text('recorded_from').notNull(), // PURCHASE_BILL, PRICE_LIST, MANUAL
  billReference: text('bill_reference'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('price_history_supplier_item_idx').on(table.tenantId, table.supplierId, table.itemId),
]);

export const batchImportsTable = pgTable('batch_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  entity: text('entity').notNull(), // CUSTOMER, SUPPLIER, ITEM
  mode: text('mode').notNull(), // CREATE_ONLY, UPDATE_ONLY, CREATE_OR_UPDATE
  totalRows: integer('total_rows').notNull(),
  createdCount: integer('created_count').notNull(),
  updatedCount: integer('updated_count').notNull(),
  failedCount: integer('failed_count').notNull(),
  createdEntityIds: jsonb('created_entity_ids').notNull(),
  previousSnapshots: jsonb('previous_snapshots').notNull(),
  errors: jsonb('errors'),
  isRolledBack: boolean('is_rolled_back').default(false).notNull(),
  rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('batch_imports_tenant_idx').on(table.tenantId),
]);


