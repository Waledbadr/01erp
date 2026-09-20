export type ImportTemplate =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'ITEMS'
  | 'ACCOUNTS'
  | 'OPENING_BALANCES'
  | 'SALES_INVOICES'
  | 'PURCHASE_BILLS'
  | 'PAYMENTS'
  | 'JOURNAL_ENTRIES'
  | 'STOCK_OPENING';

export type ImportMode = 'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE';

export type TemplateCategory = 'MASTER_DATA' | 'MOVEMENTS';

export interface ImportFieldDefinition {
  field: string;
  labelAr: string;
  labelEn: string;
  required: boolean;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'email' | 'mobile' | 'vat';
  example: string | number;
  descriptionAr: string;
  descriptionEn: string;
  aliases: string[]; // Common column header names for auto-mapping
}

export interface ImportTemplateConfig {
  template: ImportTemplate;
  nameAr: string;
  nameEn: string;
  category: TemplateCategory;
  descriptionAr: string;
  descriptionEn: string;
  primaryKeyField: string;
  secondaryKeyFields?: string[];
  fields: ImportFieldDefinition[];
  sampleRows: Record<string, any>[];
}

export interface ImportValidationError {
  rowNumber: number; // 1-based data row (excluding header row)
  field: string;
  value: any;
  errorCode: string;
  messageAr: string;
  messageEn: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  errors: ImportValidationError[];
  summaryMessageAr: string;
  summaryMessageEn: string;
  details?: {
    totalDebitSar?: number;
    totalCreditSar?: number;
    differenceSar?: number;
    balanced?: boolean;
    unbalancedEntriesCount?: number;
  };
}

export interface ColumnMapping {
  fileColumn: string;
  systemField: string;
}

export interface ImportJob {
  id: string;
  tenantId: string;
  template: ImportTemplate;
  mode: ImportMode;
  status: 'PENDING' | 'VALIDATED' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  filename: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: ImportValidationError[];
  createdRecordIds: {
    entityType: string;
    ids: string[];
    journalIds?: string[];
    stockMovementIds?: string[];
    subaccountIds?: string[];
  };
  previousSnapshots: Array<{ entityType: string; id: string; snapshot: any }>;
  createdAt: string;
  completedAt?: string;
  createdBy: string;
  isRolledBack: boolean;
  rolledBackAt?: string;
  rolledBackBy?: string;
}

export interface ExportFilterParams {
  resource: ImportTemplate | 'STOCK_MOVEMENTS';
  format?: 'CSV' | 'JSON';
  search?: string;
  status?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}
