/**
 * AI Assistant Domain Models & Types — Saudi ERP
 * Ledger-Grounded Q&A, Structured Citations, Action Suggestions & RBAC Enforcement
 */

export type QueryIntentCategory =
  | 'SALES_SUMMARY'
  | 'AR_OVERDUE'
  | 'INVENTORY_STOCK'
  | 'VAT_POSITION'
  | 'FINANCIAL_BALANCES'
  | 'DRAFT_DOCUMENTS'
  | 'CUSTOMER_INQUIRY'
  | 'SUPPLIER_INQUIRY'
  | 'GENERAL_LEDGER'
  | 'UNKNOWN';

export type ActionSuggestionType =
  | 'POST_DRAFT_INVOICE'
  | 'SEND_PAYMENT_REMINDER'
  | 'CREATE_PURCHASE_ORDER'
  | 'POST_PURCHASE_BILL'
  | 'RECORD_CUSTOMER_RECEIPT'
  | 'RECONCILE_BANK_ACCOUNT';

export type ActionSuggestionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'FAILED';

export interface DataSourceCitation {
  reportType: string;
  reportNameAr: string;
  reportNameEn: string;
  tableName: string;
  period: string;
  recordCount: number;
  computedAt: string;
  exactHalalasSum?: string | number;
  exactDisplayAmount?: string;
}

export interface ActionSuggestion {
  id: string;
  conversationId: string;
  messageId: string;
  type: ActionSuggestionType;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  requiredPermission: string;
  targetResourceId: string;
  targetResourceNumber: string;
  status: ActionSuggestionStatus;
  requiresApproval?: boolean;
  payload: Record<string, any>;
  suggestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  approvedByUserId?: string;
  executionResult?: {
    success: boolean;
    referenceNumber?: string;
    journalEntryNumber?: string;
    auditLogId?: string;
    message?: string;
  };
}

export interface StructuredQueryResultData {
  category: QueryIntentCategory;
  summaryMetrics: Array<{
    labelAr: string;
    labelEn: string;
    value: string;
    unit?: string;
    trend?: 'UP' | 'DOWN' | 'NEUTRAL';
    isSensitiveCost?: boolean;
    isScrubbed?: boolean;
  }>;
  tableHeaders?: Array<{
    key: string;
    labelAr: string;
    labelEn: string;
    isNumeric?: boolean;
  }>;
  tableRows?: Array<Record<string, any>>;
  dataFound: boolean;
  emptyReasonAr?: string;
  emptyReasonEn?: string;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  queryText: string;
  answerTextAr: string;
  answerTextEn: string;
  intentCategory: QueryIntentCategory;
  queryIntent?: QueryIntentCategory;
  dataSources: DataSourceCitation[];
  structuredData?: StructuredQueryResultData;
  actionSuggestions: ActionSuggestion[];
  provider: 'GEMINI_AI' | 'DETERMINISTIC_LEDGER' | 'NOT_CONFIGURED';
  modelName: string;
  confidenceScore: number;
  wasCostScrubbed: boolean;
  createdAt: string;
}

export interface AssistantConversation {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  titleAr: string;
  titleEn: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
}

export interface AssistantStatusInfo {
  isConfigured: boolean;
  provider: 'GEMINI_AI' | 'DETERMINISTIC_LEDGER';
  modelName: string;
  groundingStatus: 'ACTIVE_REAL_TIME_LEDGER';
  ruleCEnforced: boolean;
  tenantIsolationActive: boolean;
}

/**
 * Quick prompt suggestions for Saudi ERP workflows
 */
export interface SuggestedPrompt {
  id: string;
  category: QueryIntentCategory;
  textAr: string;
  textEn: string;
  iconName: string;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'sales-month',
    category: 'SALES_SUMMARY',
    textAr: 'ما هي مبيعات الشهر الحالي مقارنة بالفترة السابقة؟',
    textEn: "What are this month's sales compared to the previous period?",
    iconName: 'TrendingUp',
  },
  {
    id: 'overdue-ar',
    category: 'AR_OVERDUE',
    textAr: 'من هم العملاء الذين لديهم فواتير مستحقة متأخرة؟',
    textEn: 'Which customers have overdue invoices?',
    iconName: 'AlertCircle',
  },
  {
    id: 'low-stock',
    category: 'INVENTORY_STOCK',
    textAr: 'ما هي الأصناف التي وصلت للحد الأدنى من المخزون؟',
    textEn: 'Which inventory items have reached their reorder level?',
    iconName: 'PackageCheck',
  },
  {
    id: 'vat-position',
    category: 'VAT_POSITION',
    textAr: 'ما هو الموقف الضريبي الحالي وضريبة القيمة المضافة المستحقة؟',
    textEn: 'What is our current VAT payable and tax return position?',
    iconName: 'Percent',
  },
  {
    id: 'draft-invoices',
    category: 'DRAFT_DOCUMENTS',
    textAr: 'هل توجد فواتير أو مستندات مسودة بانتظار الترحيل والاعتماد؟',
    textEn: 'Are there any draft invoices awaiting posting and approval?',
    iconName: 'FileText',
  },
  {
    id: 'cash-balance',
    category: 'FINANCIAL_BALANCES',
    textAr: 'ما هو إجمالي الأرصدة النقدية والبنكية في الخزينة؟',
    textEn: 'What is our total cash and bank balance in the treasury?',
    iconName: 'Coins',
  },
];

/**
 * Client-Side API Connector for Assistant
 */
export const AssistantAPI = {
  async getStatus(): Promise<AssistantStatusInfo> {
    const res = await fetch('/api/v1/assistant/status');
    if (!res.ok) throw new Error('Failed to fetch assistant status');
    return res.json();
  },

  async getConversations(): Promise<AssistantConversation[]> {
    const res = await fetch('/api/v1/assistant/conversations');
    if (!res.ok) throw new Error('Failed to fetch conversations');
    const data = await res.json();
    return data.conversations || [];
  },

  async createConversation(title?: { titleAr: string; titleEn: string }): Promise<AssistantConversation> {
    const res = await fetch('/api/v1/assistant/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(title || {}),
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    return res.json();
  },

  async getConversationById(id: string): Promise<AssistantConversation> {
    const res = await fetch(`/api/v1/assistant/conversations/${id}`);
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
  },

  async deleteConversation(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/v1/assistant/conversations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete conversation');
    return res.json();
  },

  async clearAllConversations(): Promise<{ success: boolean; deletedCount: number }> {
    const res = await fetch('/api/v1/assistant/conversations', {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear conversations');
    return res.json();
  },

  async sendMessage(
    conversationId: string,
    query: string,
    providerPreference?: string
  ): Promise<{ conversation: AssistantConversation; message: AssistantMessage }> {
    const res = await fetch(`/api/v1/assistant/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, providerPreference }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send message');
    }
    return res.json();
  },

  async approveAction(actionId: string): Promise<ActionSuggestion> {
    const res = await fetch(`/api/v1/assistant/actions/${actionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to approve action');
    }
    return res.json();
  },

  async rejectAction(actionId: string, reason?: string): Promise<ActionSuggestion> {
    const res = await fetch(`/api/v1/assistant/actions/${actionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to reject action');
    }
    return res.json();
  },
};
