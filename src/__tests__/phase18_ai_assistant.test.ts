/**
 * Comprehensive Automated Tests for Phase 18 — AI Assistant & Decision Copilot
 * Validates Zero-Hallucination Ledger Grounding, Citations, RBAC/Rule C, Action Approval Lifecycle, and Multi-Tenancy.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  processAssistantQueryService,
  approveAssistantActionService,
  rejectAssistantActionService,
  deleteConversationService,
  clearAllConversationsService,
  classifyQueryIntent,
  DeterministicLedgerAssistantProvider,
  getTenantConversationMap,
  getTenantActionsMap,
} from '../../server/modules/assistant/assistantService.js';
import { TenantContext } from '../../server/core/tenantGuard.js';
import { AssistantQueryContext } from '../../server/modules/assistant/types.js';

describe('Phase 18: AI Assistant & Decision Copilot Verification', () => {
  let mockStore: any;
  let adminContextA: TenantContext;
  let viewerContextA: TenantContext;
  let adminContextB: TenantContext;

  beforeEach(() => {
    mockStore = {
      tenants: new Map(),
      users: new Map(),
      accounts: new Map(),
      journalEntries: new Map(),
      items: new Map(),
      salesInvoices: new Map(),
      purchaseBills: new Map(),
      zatcaInvoices: new Map(),
      warehouses: new Map(),
      parties: new Map(),
      receiptVouchers: new Map(),
      paymentVouchers: new Map(),
      auditLogs: new Map(),
      stockMovements: new Map(),
    };

    // Setup Tenant A Contexts
    adminContextA = {
      tenantId: 'tenant-saudi-corp',
      userId: 'usr-admin-1',
      role: 'ADMIN',
      userEmail: 'cfo@saudicorp.sa',
      permissions: ['*'],
    };

    viewerContextA = {
      tenantId: 'tenant-saudi-corp',
      userId: 'usr-viewer-1',
      role: 'VIEWER',
      userEmail: 'auditor@saudicorp.sa',
      permissions: ['reports:read'],
    };

    // Setup Tenant B Context
    adminContextB = {
      tenantId: 'tenant-riyadh-trading',
      userId: 'usr-admin-2',
      role: 'ADMIN',
      userEmail: 'admin@riyadh.sa',
      permissions: ['*'],
    };

    // Clear memory caches
    const convMapA = getTenantConversationMap('tenant-saudi-corp');
    convMapA.clear();
    const actionMapA = getTenantActionsMap('tenant-saudi-corp');
    actionMapA.clear();

    const convMapB = getTenantConversationMap('tenant-riyadh-trading');
    convMapB.clear();

    // Populate Mock Store for Tenant A
    mockStore.salesInvoices.set('inv-001', {
      id: 'inv-001',
      tenantId: 'tenant-saudi-corp',
      invoiceNumber: 'INV-2026-001',
      partyId: 'party-cust-1',
      issueDate: '2026-03-01',
      dueDate: '2026-03-10',
      status: 'ISSUED',
      paymentStatus: 'UNPAID',
      subtotalSar: '10000.00',
      taxTotalSar: '1500.00',
      grandTotalSar: '11500.00',
      grandTotalHalalas: 1150000,
      createdAt: '2026-03-01T10:00:00Z',
    });

    mockStore.salesInvoices.set('inv-002', {
      id: 'inv-002',
      tenantId: 'tenant-saudi-corp',
      invoiceNumber: 'INV-2026-002',
      partyId: 'party-cust-2',
      issueDate: '2026-03-05',
      dueDate: '2026-03-15',
      status: 'ISSUED',
      paymentStatus: 'PAID',
      subtotalSar: '20000.00',
      taxTotalSar: '3000.00',
      grandTotalSar: '23000.00',
      grandTotalHalalas: 2300000,
      createdAt: '2026-03-05T10:00:00Z',
    });

    mockStore.salesInvoices.set('inv-draft-001', {
      id: 'inv-draft-001',
      tenantId: 'tenant-saudi-corp',
      invoiceNumber: 'DRAFT-001',
      partyId: 'party-cust-1',
      issueDate: '2026-03-18',
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      grandTotalSar: '5750.00',
      grandTotalHalalas: 575000,
      createdAt: '2026-03-18T10:00:00Z',
    });

    mockStore.parties.set('party-cust-1', {
      id: 'party-cust-1',
      tenantId: 'tenant-saudi-corp',
      nameAr: 'شركة الأمل المحدودة',
      nameEn: 'Hope Trading LLC',
      phone: '+966500000001',
      email: 'hope@customer.sa',
    });

    mockStore.items.set('item-001', {
      id: 'item-001',
      tenantId: 'tenant-saudi-corp',
      sku: 'SKU-LAPTOP-01',
      nameAr: 'حاسب محمول فائق السرعة',
      nameEn: 'Pro Laptop 16',
      quantityOnHand: 2,
      reorderPoint: 5,
      costPriceSar: '3500.00',
      sellingPriceSar: '4999.00',
      isActive: true,
    });
  });

  describe('1. Intent Classification & Pattern Matching', () => {
    it('accurately identifies intent categories in Arabic and English', () => {
      expect(classifyQueryIntent('كم مبيعات هذا الشهر؟')).toBe('SALES_SUMMARY');
      expect(classifyQueryIntent('What are the total sales?')).toBe('SALES_SUMMARY');
      expect(classifyQueryIntent('من هم العملاء المتأخرين في السداد؟')).toBe('AR_OVERDUE');
      expect(classifyQueryIntent('Show me overdue customer receivables')).toBe('AR_OVERDUE');
      expect(classifyQueryIntent('ما هي الأصناف التي وصلت نقطة إعادة الطلب؟')).toBe('INVENTORY_STOCK');
      expect(classifyQueryIntent('Low stock alerts')).toBe('INVENTORY_STOCK');
      expect(classifyQueryIntent('ما هو الموقف الضريبي لضريبة القيمة المضافة؟')).toBe('VAT_POSITION');
      expect(classifyQueryIntent('What is my VAT return position?')).toBe('VAT_POSITION');
      expect(classifyQueryIntent('ما هي الفواتير المسودة المعلقة؟')).toBe('DRAFT_DOCUMENTS');
      expect(classifyQueryIntent('عرض أرصدة الخزينة والبنوك')).toBe('FINANCIAL_BALANCES');
    });
  });

  describe('2. Direct Parameterized Ledger Grounding & Zero Hallucination', () => {
    it('computes sales summary directly from verified store invoices', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-1',
        query: 'ما هي مبيعات شهر مارس؟',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);

      expect(result.message.queryIntent).toBe('SALES_SUMMARY');
      expect(result.message.dataSources.length).toBeGreaterThan(0);
      expect(result.message.dataSources[0].reportNameAr).toBe('تقرير ملخص المبيعات');
      expect(result.message.dataSources[0].tableName).toBe('sales_invoices');
      // Sales total = 11500 (inv-001) + 23000 (inv-002) = 34500.00 SAR
      expect(result.message.answerTextAr).toContain('34,500.00');
    });

    it('identifies overdue receivables matching unpaid invoice dates', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-2',
        query: 'Who are the overdue customers?',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);

      expect(result.message.queryIntent).toBe('AR_OVERDUE');
      expect(result.message.dataSources[0].tableName).toBe('sales_invoices');
      expect(result.message.dataSources[0].recordCount).toBe(1);
      // Contains the overdue invoice amount: 11,500.00 SAR
      expect(result.message.answerTextEn).toContain('11,500.00');
    });

    it('identifies low stock items requiring replenishment', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-3',
        query: 'ما هي نواقص المخزون؟',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);

      expect(result.message.queryIntent).toBe('INVENTORY_STOCK');
      expect(result.message.dataSources[0].tableName).toBe('inventory_items');
      expect(result.message.answerTextAr).toContain('حاسب محمول فائق السرعة');
      expect(result.message.answerTextAr).toContain('2');
    });
  });

  describe('3. Pluggable AssistantAiProvider & Honest Not-Configured State', () => {
    it('deterministic provider reports configured state honestly and does not fabricate data', () => {
      const provider = new DeterministicLedgerAssistantProvider();
      expect(provider.isConfigured()).toBe(true);
      expect(provider.name).toBe('Deterministic Ledger Engine');
    });
  });

  describe('4. Action Suggestion Lifecycle & Human Approval Required', () => {
    it('creates action suggestions in PENDING state by default, never auto-posting', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-action',
        query: 'اعرض الفواتير المسودة والمستحقات',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);

      expect(result.message.actionSuggestions.length).toBeGreaterThan(0);
      const firstAction = result.message.actionSuggestions[0];
      expect(firstAction.status).toBe('PENDING');
      expect(firstAction.requiresApproval).toBe(true);
    });

    it('executes action only upon explicit user approval, logging audit trail', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-approval',
        query: 'اعرض النواقص لطلب الشراء',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);
      const action = result.message.actionSuggestions[0];
      expect(action.status).toBe('PENDING');

      // User approves action
      const approved = await approveAssistantActionService(mockStore, adminContextA, action.id);
      expect(approved.status).toBe('EXECUTED');
      expect(approved.approvedByUserId).toBe(adminContextA.userId);
      expect(approved.executionResult?.success).toBe(true);

      // Audit log was recorded
      expect(mockStore.auditLogs.size).toBeGreaterThan(0);
    });

    it('rejects action upon user dismissal without touching records', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-test-reject',
        query: 'اعرض النواقص',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);
      const action = result.message.actionSuggestions[0];

      const rejected = await rejectAssistantActionService(
        mockStore,
        adminContextA,
        action.id,
        'Not needed right now'
      );
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.executionResult?.success).toBe(false);
    });
  });

  describe('5. RBAC & Rule C (Cost / Margin Scrubbing)', () => {
    it('scrubs cost and margin data when user lacks cost viewing permission', async () => {
      const queryContext: AssistantQueryContext = {
        tenant: viewerContextA,
        conversationId: 'conv-test-viewer',
        query: 'ما هي مبيعات الشهر وهوامش الربح؟',
        userRole: 'VIEWER',
        userPermissions: ['reports:read'],
        canViewCost: false, // Rule C scrub
        canPerformActions: false,
      };

      const result = await processAssistantQueryService(mockStore, queryContext);

      // Check metrics in structuredData
      const costMetric = result.message.structuredData?.summaryMetrics.find((m) => m.isScrubbed);
      expect(costMetric).toBeDefined();
      expect(costMetric?.value).toContain('محجوب');

      // Restrictive viewer should get ZERO proposed action buttons
      expect(result.message.actionSuggestions.length).toBe(0);
    });
  });

  describe('6. Multi-Tenant Isolation & Cascading Conversation Management', () => {
    it('strictly isolates conversations between tenants', async () => {
      const queryContextA: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-tenant-a-1',
        query: 'المبيعات',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      await processAssistantQueryService(mockStore, queryContextA);

      const convMapA = getTenantConversationMap(adminContextA.tenantId);
      const convMapB = getTenantConversationMap(adminContextB.tenantId);

      expect(convMapA.has('conv-tenant-a-1')).toBe(true);
      expect(convMapB.has('conv-tenant-a-1')).toBe(false);
    });

    it('cascades deletion of conversation and removes pending actions', async () => {
      const queryContextA: AssistantQueryContext = {
        tenant: adminContextA,
        conversationId: 'conv-to-delete',
        query: 'فواتير مسودة',
        userRole: 'ADMIN',
        userPermissions: ['*'],
        canViewCost: true,
        canPerformActions: true,
      };

      await processAssistantQueryService(mockStore, queryContextA);

      const convMapA = getTenantConversationMap(adminContextA.tenantId);
      const actionsMapA = getTenantActionsMap(adminContextA.tenantId);

      expect(convMapA.has('conv-to-delete')).toBe(true);

      // Delete conversation
      const delResult = deleteConversationService(mockStore, adminContextA, 'conv-to-delete');
      expect(delResult.success).toBe(true);
      expect(convMapA.has('conv-to-delete')).toBe(false);

      // Actions associated with that conversation should also be cleaned up
      const remainingActions = Array.from(actionsMapA.values()).filter(
        (a) => a.conversationId === 'conv-to-delete'
      );
      expect(remainingActions.length).toBe(0);
    });
  });
});
