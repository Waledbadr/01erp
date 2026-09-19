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

// ==========================================
// 12. STOCK MOVEMENTS & INVENTORY ENGINE (PHASE-05)
// ==========================================
export const warehouseStocksTable = pgTable('warehouse_stocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  warehouseId: uuid('warehouse_id').references(() => warehousesTable.id).notNull(),
  itemId: uuid('item_id').references(() => itemsTable.id).notNull(),
  currentStockBaseQty: integer('current_stock_base_qty').default(0).notNull(),
  reservedQty: integer('reserved_qty').default(0).notNull(),
  availableQty: integer('available_qty').default(0).notNull(),
  currentWac: integer('current_wac').default(0).notNull(), // in Halalas (cents)
  totalValuation: bigint('total_valuation', { mode: 'bigint' }).default(0n).notNull(),
  binLocation: text('bin_location'),
  lastReceiptDate: text('last_receipt_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('wh_stocks_tenant_idx').on(table.tenantId),
  uniqueIndex('wh_stocks_unique_item_wh').on(table.tenantId, table.warehouseId, table.itemId),
]);

export const stockMovementsTable = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  warehouseId: uuid('warehouse_id').references(() => warehousesTable.id).notNull(),
  itemId: uuid('item_id').references(() => itemsTable.id).notNull(),
  movementType: text('movement_type').notNull(), // OPENING_STOCK, PURCHASE_RECEIPT, PURCHASE_RETURN, SALES_ISSUE, SALES_RETURN, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT, STOCKTAKE_VARIANCE, SCRAP_OR_LOSS
  quantityDelta: integer('quantity_delta').notNull(), // in base units (+ or -)
  unitCostApplied: integer('unit_cost_applied').notNull(), // in halalas
  resultingWac: integer('resulting_wac').notNull(), // in halalas
  valueDelta: bigint('value_delta', { mode: 'bigint' }).notNull(), // in halalas
  resultingStock: integer('resulting_stock').notNull(), // in base units
  sourceType: text('source_type').notNull(), // MANDATORY (I1/I5): PURCHASE_BILL, SALES_INVOICE, STOCK_TRANSFER, STOCK_ADJUSTMENT, STOCKTAKE, OPENING_STOCK
  sourceId: text('source_id').notNull(), // MANDATORY: FK or external source identifier
  sourceDocumentNumber: text('source_document_number'),
  journalId: uuid('journal_id').references(() => journalEntriesTable.id),
  reason: text('reason'),
  notes: text('notes'),
  batchNumber: text('batch_number'),
  serialNumber: text('serial_number'),
  userId: uuid('user_id').references(() => usersTable.id),
  userEmail: text('user_email').notNull(),
  movementDate: text('movement_date').notNull(), // YYYY-MM-DD
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('stock_mov_tenant_idx').on(table.tenantId),
  index('stock_mov_item_idx').on(table.tenantId, table.itemId),
  index('stock_mov_warehouse_idx').on(table.tenantId, table.warehouseId),
  index('stock_mov_source_idx').on(table.tenantId, table.sourceType, table.sourceId),
  index('stock_mov_date_idx').on(table.tenantId, table.movementDate),
]);

export const stockTransfersTable = pgTable('stock_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  transferNumber: text('transfer_number').notNull(), // TRF-YYYY-XXXXX
  fromWarehouseId: uuid('from_warehouse_id').references(() => warehousesTable.id).notNull(),
  toWarehouseId: uuid('to_warehouse_id').references(() => warehousesTable.id).notNull(),
  status: text('status').default('COMPLETED').notNull(), // DRAFT, IN_TRANSIT, COMPLETED, CANCELLED
  transferDate: text('transfer_date').notNull(),
  lines: jsonb('lines').notNull(), // [{ itemId, unitId, quantity, baseQuantity, unitCost, totalValue }]
  totalValueSar: integer('total_value_sar').default(0).notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('transfers_tenant_idx').on(table.tenantId),
  uniqueIndex('transfers_num_idx').on(table.tenantId, table.transferNumber),
]);

export const stockAdjustmentsTable = pgTable('stock_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  adjustmentNumber: text('adjustment_number').notNull(), // ADJ-YYYY-XXXXX
  warehouseId: uuid('warehouse_id').references(() => warehousesTable.id).notNull(),
  status: text('status').default('APPROVED').notNull(), // DRAFT, PENDING_APPROVAL, APPROVED, REJECTED
  adjustmentDate: text('adjustment_date').notNull(),
  reasonCode: text('reason_code').notNull(), // DAMAGE, WASTE, LOSS, EXPIRY, FOUND_GOODS, CORRECTION
  description: text('description').notNull(),
  lines: jsonb('lines').notNull(), // [{ itemId, unitId, quantityDelta, baseQuantityDelta, unitCost, totalValueDelta, reason }]
  journalId: uuid('journal_id').references(() => journalEntriesTable.id),
  approvedBy: uuid('approved_by').references(() => usersTable.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('adjustments_tenant_idx').on(table.tenantId),
  uniqueIndex('adjustments_num_idx').on(table.tenantId, table.adjustmentNumber),
]);

export const stocktakesTable = pgTable('stocktakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  stocktakeNumber: text('stocktake_number').notNull(), // STK-YYYY-XXXXX
  warehouseId: uuid('warehouse_id').references(() => warehousesTable.id).notNull(),
  scopeType: text('scope_type').notNull(), // FULL_WAREHOUSE, BY_CATEGORY, BY_ITEMS
  categoryId: uuid('category_id'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, IN_PROGRESS, REVIEW, APPROVED, CANCELLED
  snapshotDate: text('snapshot_date').notNull(),
  entries: jsonb('entries').notNull(), // [{ itemId, itemNameAr, sku, baseUnit, systemBookQty, countedQty, varianceQty, unitWac, varianceValueSar }]
  totalPositiveVarianceSar: integer('total_positive_variance_sar').default(0).notNull(),
  totalNegativeVarianceSar: integer('total_negative_variance_sar').default(0).notNull(),
  netVarianceSar: integer('net_variance_sar').default(0).notNull(),
  journalId: uuid('journal_id').references(() => journalEntriesTable.id),
  approvedBy: uuid('approved_by').references(() => usersTable.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('stocktakes_tenant_idx').on(table.tenantId),
  uniqueIndex('stocktakes_num_idx').on(table.tenantId, table.stocktakeNumber),
]);

export const landedCostDocumentsTable = pgTable('landed_cost_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  documentNumber: text('document_number').notNull(), // LC-YYYY-XXXXX
  sourceBillId: text('source_bill_id').notNull(), // Purchase receipt or bill ID
  sourceBillNumber: text('source_bill_number').notNull(),
  status: text('status').default('POSTED').notNull(),
  allocationMethod: text('allocation_method').notNull(), // QUANTITY, VALUE, WEIGHT, VOLUME, PERCENTAGE, MANUAL
  costLines: jsonb('cost_lines').notNull(), // [{ type: FREIGHT | CUSTOMS | CLEARANCE | INSURANCE | HANDLING | OTHER, amountSar, description }]
  totalLandedCostSar: integer('total_landed_cost_sar').notNull(),
  allocations: jsonb('allocations').notNull(), // [{ itemId, itemNameAr, quantity, basePrice, allocatedAmount, effectiveUnitCost }]
  journalId: uuid('journal_id').references(() => journalEntriesTable.id),
  createdBy: uuid('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('landed_cost_tenant_idx').on(table.tenantId),
  uniqueIndex('landed_cost_num_idx').on(table.tenantId, table.documentNumber),
]);

export const unitsCatalogTable = pgTable('units_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  code: text('code').notNull(), // PCE, BOX, CTN, KG, etc.
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  symbolAr: text('symbol_ar').notNull(),
  symbolEn: text('symbol_en').notNull(),
  category: text('category').notNull(), // COUNT, WEIGHT, VOLUME, LENGTH, AREA, OTHER
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('units_catalog_tenant_idx').on(table.tenantId),
  uniqueIndex('units_catalog_tenant_code_idx').on(table.tenantId, table.code),
]);

export const warehousesTable = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  branchId: uuid('branch_id').references(() => branchesTable.id),
  code: text('code').notNull(), // WH-01
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  address: text('address'),
  managerName: text('manager_name'),
  contactPhone: text('contact_phone'),
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  bins: jsonb('bins'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('warehouses_tenant_idx').on(table.tenantId),
  uniqueIndex('warehouses_tenant_code_idx').on(table.tenantId, table.code),
]);

export const itemsTable = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  sku: text('sku').notNull(),
  primaryBarcode: text('primary_barcode').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  type: text('type').notNull(), // INVENTORY, SERVICE, RAW_MATERIAL, CONSUMABLE, FIXED_ASSET
  categoryId: uuid('category_id'),
  categoryNameAr: text('category_name_ar'),
  brandId: uuid('brand_id'),
  brandName: text('brand_name'),
  baseUnit: text('base_unit').notNull(),
  taxRate: integer('tax_rate').default(15).notNull(),
  taxCategory: text('tax_category').default('STANDARD').notNull(), // STANDARD, ZERO_RATED, EXEMPT, OUT_OF_SCOPE
  isVatInclusive: boolean('is_vat_inclusive').default(false).notNull(),
  sellingPrice: integer('selling_price').default(0).notNull(),
  wholesalePrice: integer('wholesale_price'),
  cost: integer('cost').default(0).notNull(),
  currentWac: integer('current_wac').default(0).notNull(),
  trackBatches: boolean('track_batches').default(false).notNull(),
  trackSerialNumbers: boolean('track_serial_numbers').default(false).notNull(),
  trackExpiry: boolean('track_expiry').default(false).notNull(),
  minStockLevel: integer('min_stock_level').default(0).notNull(),
  maxStockLevel: integer('max_stock_level').default(10000).notNull(),
  reorderPoint: integer('reorder_point').default(0).notNull(),
  reorderQuantity: integer('reorder_quantity').default(0).notNull(),
  barcodeAliases: jsonb('barcode_aliases'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('items_tenant_idx').on(table.tenantId),
  uniqueIndex('items_tenant_sku_idx').on(table.tenantId, table.sku),
  index('items_tenant_barcode_idx').on(table.tenantId, table.primaryBarcode),
]);

export const customerPriceRulesTable = pgTable('customer_price_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  customerId: uuid('customer_id').references(() => customersTable.id).notNull(),
  itemId: uuid('item_id').references(() => itemsTable.id).notNull(),
  unitId: uuid('unit_id'),
  unitPriceSar: integer('unit_price_sar').notNull(),
  discountPercentage: integer('discount_percentage'),
  minQuantity: integer('min_quantity').default(1).notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cust_price_rules_tenant_idx').on(table.tenantId),
  index('cust_price_rules_lookup_idx').on(table.tenantId, table.customerId, table.itemId),
]);

export const itemPriceHistoryTable = pgTable('item_price_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenantsTable.id).notNull(),
  itemId: uuid('item_id').references(() => itemsTable.id).notNull(),
  unitId: uuid('unit_id'),
  oldPriceSar: integer('old_price_sar').notNull(),
  newPriceSar: integer('new_price_sar').notNull(),
  changeType: text('change_type').notNull(), // DEFAULT_UNIT_PRICE, CUSTOMER_PRICE, MANUAL_OVERRIDE
  reason: text('reason'),
  userId: uuid('user_id').references(() => usersTable.id),
  userEmail: text('user_email').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('item_price_history_tenant_idx').on(table.tenantId, table.itemId),
]);



