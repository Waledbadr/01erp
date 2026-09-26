/**
 * Master Reports Orchestrator & Async Jobs Engine — Saudi ERP
 * Handles:
 * - Unified report dispatcher
 * - Rule C sensitive cost/margin scrubbing
 * - In-memory filter presets
 * - Async heavy report jobs with simulated background processing & polling
 * - Source document resolution for drill-downs
 */

import { centralStore, TenantScopedRepository } from '../../core/tenantGuard.js';
import {
  ReportType,
  ReportParameterSchema,
  ReportResult,
  ReportFilterPreset,
  ReportAsyncJob,
  REPORT_DEFINITIONS,
  SourceDocumentReference,
} from '../../../src/lib/reports.js';

import {
  executeTrialBalance,
  executeGeneralLedger,
  executeProfitLoss,
  executeBalanceSheet,
  executeCashFlow,
  executeJournalReport,
} from './financialReports.js';

import {
  executeCustomerStatement,
  executeSupplierStatement,
  executeArAging,
  executeOverdueReceivables,
  executePartiesBalanceSummary,
  executeCustomerProfitability,
} from './arApReports.js';

import {
  executeSalesPeriodicSummary,
  executeSalesByDimension,
  executeInvoiceProfitMargin,
  executeStockValuation,
  executeStockMovementsReport,
  executeDeadSlowMoving,
  executeLowStockReport,
  executeVatSalesReport,
  executeVatGlReconciliation,
} from './salesInventoryVatReports.js';
import { registerTenantState } from '../../db/tenantStateRegistry.js';

// In-memory tenant stores for presets and async jobs
const tenantPresets = new Map<string, ReportFilterPreset[]>();
registerTenantState('reports.reportService.tenantPresets', tenantPresets);
const tenantJobs = new Map<string, ReportAsyncJob[]>();

registerTenantState('reports.reportService.tenantJobs', tenantJobs);
export class ReportService {
  /**
   * Execute any report synchronously
   */
  public static executeReport(
    tenantId: string,
    reportType: ReportType,
    params: ReportParameterSchema,
    userPermissions: string[] = [],
    userRole: string = ''
  ): ReportResult {
    // Check cost permission (Rule C)
    const canViewCost =
      userRole === 'ADMIN' ||
      userRole === 'SUPER_ADMIN' ||
      userPermissions.includes('accounting:cost:view') ||
      userPermissions.includes('*') ||
      userPermissions.includes('reports:all');

    // Rule C Enforcement on gated reports
    const reportDef = REPORT_DEFINITIONS.find((d) => d.type === reportType);
    if (reportDef?.requiresCostPermission && !canViewCost && reportType === 'CUSTOMER_PROFITABILITY') {
      // In customer profitability, we allow running but scrub sensitive columns
    }

    switch (reportType) {
      // Financial
      case 'TRIAL_BALANCE':
        return executeTrialBalance(tenantId, params);
      case 'GENERAL_LEDGER':
        return executeGeneralLedger(tenantId, params);
      case 'PROFIT_LOSS':
        return executeProfitLoss(tenantId, params);
      case 'BALANCE_SHEET':
        return executeBalanceSheet(tenantId, params);
      case 'CASH_FLOW':
        return executeCashFlow(tenantId, params);
      case 'JOURNAL_REPORT':
        return executeJournalReport(tenantId, params);

      // AR/AP
      case 'CUSTOMER_STATEMENT':
        return executeCustomerStatement(tenantId, params);
      case 'SUPPLIER_STATEMENT':
        return executeSupplierStatement(tenantId, params);
      case 'AR_AGING':
        return executeArAging(tenantId, params);
      case 'OVERDUE_RECEIVABLES':
        return executeOverdueReceivables(tenantId, params);
      case 'PARTIES_BALANCE_SUMMARY':
        return executePartiesBalanceSummary(tenantId, params);
      case 'CUSTOMER_PROFITABILITY':
        return executeCustomerProfitability(tenantId, params, canViewCost);

      // Sales
      case 'SALES_PERIODIC_SUMMARY':
        return executeSalesPeriodicSummary(tenantId, params);
      case 'SALES_BY_CUSTOMER':
        return executeSalesByDimension(tenantId, params, 'CUSTOMER');
      case 'SALES_BY_ITEM':
        return executeSalesByDimension(tenantId, params, 'ITEM');
      case 'SALES_BY_REP':
        return executeSalesByDimension(tenantId, params, 'REP');
      case 'SALES_BY_BRANCH':
        return executeSalesByDimension(tenantId, params, 'BRANCH');
      case 'SALES_BY_PAYMENT_METHOD':
        return executeSalesByDimension(tenantId, params, 'PAYMENT');
      case 'INVOICE_PROFIT_MARGIN':
        return executeInvoiceProfitMargin(tenantId, params, canViewCost);
      case 'SALES_RETURNS_ANALYSIS':
        return executeSalesPeriodicSummary(tenantId, params);

      // Inventory
      case 'STOCK_VALUATION':
        return executeStockValuation(tenantId, params, canViewCost);
      case 'STOCK_MOVEMENTS_REPORT':
        return executeStockMovementsReport(tenantId, params);
      case 'DEAD_SLOW_MOVING':
        return executeDeadSlowMoving(tenantId, params);
      case 'LOW_STOCK_REPORT':
        return executeLowStockReport(tenantId, params);
      case 'BEST_WORST_SELLERS':
        return executeSalesByDimension(tenantId, params, 'ITEM');
      case 'INVENTORY_AGING':
        return executeStockValuation(tenantId, params, canViewCost);

      // VAT
      case 'VAT_SALES_REPORT':
        return executeVatSalesReport(tenantId, params);
      case 'VAT_PURCHASE_REPORT':
        return executeVatSalesReport(tenantId, params);
      case 'VAT_NET_POSITION':
      case 'VAT_GL_RECONCILIATION':
        return executeVatGlReconciliation(tenantId, params);

      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }

  // ==========================================
  // ASYNC REPORT JOBS
  // ==========================================

  public static createAsyncJob(
    tenantId: string,
    userId: string,
    userEmail: string,
    reportType: ReportType,
    params: ReportParameterSchema,
    userPermissions: string[] = [],
    userRole: string = ''
  ): ReportAsyncJob {
    const jobs = tenantJobs.get(tenantId) || [];
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newJob: ReportAsyncJob = {
      id: jobId,
      tenantId,
      userId,
      userEmail,
      reportType,
      parameters: params,
      status: 'PROCESSING',
      progressPercentage: 50,
      createdAt: new Date().toISOString(),
    };

    jobs.unshift(newJob);
    tenantJobs.set(tenantId, jobs);

    // Run execution asynchronously
    try {
      const result = this.executeReport(tenantId, reportType, params, userPermissions, userRole);
      newJob.status = 'COMPLETED';
      newJob.progressPercentage = 100;
      newJob.rowCount = result.rows.length;
      newJob.completedAt = new Date().toISOString();
      newJob.resultData = result;
      newJob.resultSummary = {
        totalRows: result.rows.length,
        executionTimeMs: result.executionTimeMs,
        isBalanced: result.isBalanced,
      };
      newJob.downloadUrl = `/api/v1/reports/jobs/${jobId}/download`;
    } catch (err: any) {
      newJob.status = 'FAILED';
      newJob.error = err.message || 'Error processing report';
      newJob.completedAt = new Date().toISOString();
    }

    return newJob;
  }

  public static getJobs(tenantId: string): ReportAsyncJob[] {
    return tenantJobs.get(tenantId) || [];
  }

  public static getJobById(tenantId: string, jobId: string): ReportAsyncJob | undefined {
    const jobs = tenantJobs.get(tenantId) || [];
    return jobs.find((j) => j.id === jobId);
  }

  // ==========================================
  // PRESETS
  // ==========================================

  public static getPresets(tenantId: string, userId?: string): ReportFilterPreset[] {
    const list = tenantPresets.get(tenantId) || [];
    if (userId) {
      return list.filter((p) => p.userId === userId || p.isDefault);
    }
    return list;
  }

  public static savePreset(
    tenantId: string,
    userId: string,
    reportType: ReportType,
    name: string,
    parameters: ReportParameterSchema,
    isDefault = false
  ): ReportFilterPreset {
    const list = tenantPresets.get(tenantId) || [];
    const id = `preset-${Date.now()}`;
    const preset: ReportFilterPreset = {
      id,
      tenantId,
      userId,
      reportType,
      name,
      parameters,
      isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(preset);
    tenantPresets.set(tenantId, list);
    return preset;
  }

  public static deletePreset(tenantId: string, presetId: string): boolean {
    const list = tenantPresets.get(tenantId) || [];
    const filtered = list.filter((p) => p.id !== presetId);
    tenantPresets.set(tenantId, filtered);
    return filtered.length < list.length;
  }

  // ==========================================
  // SOURCE DOCUMENT RESOLUTION (DRILL-DOWN)
  // ==========================================

  public static resolveSourceDocument(tenantId: string, type: string, id: string): any {
    if (type === 'JOURNAL') {
      const journals = centralStore.journals.get(tenantId) || [];
      return journals.find((j: any) => j.id === id || j.journalNumber === id || j.entryNumber === id);
    }

    if (type === 'SALES_INVOICE') {
      const invoices = centralStore.salesInvoices?.get(tenantId) || [];
      return invoices.find((i) => i.id === id || i.invoiceNumber === id);
    }

    if (type === 'PURCHASE_BILL') {
      const bills = centralStore.purchaseBills?.get(tenantId) || [];
      return bills.find((b: any) => b.id === id || b.billNumber === id);
    }

    if (type === 'STOCK_MOVEMENT') {
      const movements = centralStore.stockMovements?.get(tenantId) || [];
      return movements.find((m: any) => m.id === id || m.movementNumber === id || m.referenceNumber === id || m.sourceDocumentNumber === id);
    }

    if (type === 'CUSTOMER_RECEIPT') {
      const receipts = (centralStore as any).receiptVouchers?.get(tenantId) || (centralStore as any).customerReceipts?.get(tenantId) || [];
      return receipts.find((r: any) => r.id === id || r.voucherNumber === id);
    }

    if (type === 'SUPPLIER_PAYMENT') {
      const payments = (centralStore as any).paymentVouchers?.get(tenantId) || (centralStore as any).supplierPayments?.get(tenantId) || [];
      return payments.find((p: any) => p.id === id || p.voucherNumber === id);
    }

    return null;
  }
}
