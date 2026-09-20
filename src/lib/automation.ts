/**
 * Client-Side Library for Automation Engine — Saudi ERP Platform
 * Connects frontend UI to backend REST API with fallback simulation.
 */

export type TriggerType =
  | 'document_created'
  | 'document_submitted'
  | 'document_approved'
  | 'document_posted'
  | 'payment_received'
  | 'low_stock_detected'
  | 'credit_limit_breached'
  | 'invoice_overdue'
  | 'zatca_failure'
  | 'backup_failure'
  | 'subscription_event';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'in_list'
  | 'not_in_list'
  | 'is_empty'
  | 'is_not_empty';

export interface SingleCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: any;
}

export interface ConditionGroup {
  id: string;
  logicalOperator: 'AND' | 'OR';
  conditions: (SingleCondition | ConditionGroup)[];
}

export type ActionType =
  | 'send_notification'
  | 'send_email'
  | 'create_task'
  | 'create_draft_document'
  | 'change_status'
  | 'tag_record'
  | 'call_webhook'
  | 'delay_schedule';

export interface AutomationAction {
  id: string;
  type: ActionType;
  params: Record<string, any>;
  enabled: boolean;
  order: number;
}

export interface AutomationRule {
  id: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  trigger: TriggerType;
  conditionTree: ConditionGroup;
  actions: AutomationAction[];
  enabled: boolean;
  priority: number;
  effectiveWindow?: {
    validFrom?: string;
    validTo?: string;
  };
  retryPolicy: {
    maxAttempts: number;
    backoffMinutes: number;
    retryOnFailure: boolean;
  };
  stats: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    lastRunAt?: string;
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  };
  createdAt: string;
  updatedAt: string;
}

export interface ConditionEvaluationResult {
  conditionId: string;
  field: string;
  operator: ConditionOperator;
  expectedValue: any;
  actualValue: any;
  matched: boolean;
}

export interface ActionResultLog {
  actionId: string;
  actionType: ActionType;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DELAYED';
  executionTimeMs: number;
  result?: any;
  error?: string;
  retryAttempt?: number;
}

export interface ExecutionHistoryLog {
  runId: string;
  ruleId: string;
  ruleNameAr: string;
  ruleNameEn: string;
  tenantId: string;
  trigger: TriggerType;
  triggerPayload: Record<string, any>;
  timestamp: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  conditionMatched: boolean;
  conditionTrace: ConditionEvaluationResult[];
  actionResults: ActionResultLog[];
  dryRun: boolean;
  errorDetails?: string;
}

export interface DryRunResponse {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionTrace: ConditionEvaluationResult[];
  simulatedActions: Array<{
    actionType: ActionType;
    wouldExecute: boolean;
    description: string;
    previewPayload: Record<string, any>;
  }>;
  evaluatedAt: string;
}

export interface FieldDefinition {
  field: string;
  labelAr: string;
  labelEn: string;
  category: 'Sales' | 'Purchasing' | 'Inventory' | 'ZATCA' | 'Accounting' | 'Parties' | 'System';
  type: 'number' | 'string' | 'boolean' | 'array';
  sampleValues?: any[];
}

export const AVAILABLE_FIELDS: FieldDefinition[] = [
  // Sales
  { field: 'documentType', labelAr: 'نوع المستند', labelEn: 'Document Type', category: 'Sales', type: 'string', sampleValues: ['SALES_INVOICE', 'SIMPLIFIED_INVOICE', 'QUOTATION', 'PURCHASE_BILL'] },
  { field: 'totalAmountSar', labelAr: 'المبلغ الإجمالي (﷼)', labelEn: 'Total Amount (SAR)', category: 'Sales', type: 'number', sampleValues: [5000, 10000, 50000] },
  { field: 'paymentMethod', labelAr: 'طريقة الدفع', labelEn: 'Payment Method', category: 'Sales', type: 'string', sampleValues: ['CASH', 'MADA', 'CREDIT', 'BANK_TRANSFER'] },
  { field: 'branchId', labelAr: 'الفرع', labelEn: 'Branch', category: 'Sales', type: 'string' },
  { field: 'customerId', labelAr: 'معرف العميل', labelEn: 'Customer ID', category: 'Sales', type: 'string' },
  { field: 'customerName', labelAr: 'اسم العميل', labelEn: 'Customer Name', category: 'Sales', type: 'string' },
  
  // Receivables & Collections
  { field: 'daysOverdue', labelAr: 'أيام التأخير', labelEn: 'Days Overdue', category: 'Parties', type: 'number', sampleValues: [7, 15, 30, 60] },
  { field: 'balanceDueSar', labelAr: 'المبلغ المستحق (﷼)', labelEn: 'Balance Due (SAR)', category: 'Parties', type: 'number', sampleValues: [500, 2000, 10000] },
  { field: 'creditDeficitSar', labelAr: 'تجاوز السقف الائتماني (﷼)', labelEn: 'Credit Deficit (SAR)', category: 'Parties', type: 'number', sampleValues: [1000, 5000] },
  { field: 'currentBalanceSar', labelAr: 'الرصيد القائم للعميل', labelEn: 'Customer Balance (SAR)', category: 'Parties', type: 'number' },
  
  // Inventory
  { field: 'stockQuantity', labelAr: 'كمية المخزون الحالية', labelEn: 'Current Stock Quantity', category: 'Inventory', type: 'number', sampleValues: [0, 5, 10] },
  { field: 'reorderLevel', labelAr: 'حد إعادة الطلب', labelEn: 'Reorder Level', category: 'Inventory', type: 'number', sampleValues: [10, 20, 50] },
  { field: 'isCritical', labelAr: 'صنف حرج/أساسي', labelEn: 'Is Critical Item', category: 'Inventory', type: 'boolean', sampleValues: [true, false] },
  { field: 'warehouseId', labelAr: 'المستودع', labelEn: 'Warehouse ID', category: 'Inventory', type: 'string' },
  { field: 'itemCode', labelAr: 'رمز الصنف (SKU)', labelEn: 'Item Code (SKU)', category: 'Inventory', type: 'string' },
  
  // ZATCA
  { field: 'zatcaStatus', labelAr: 'حالة الزكاة والضريبة', labelEn: 'ZATCA Status', category: 'ZATCA', type: 'string', sampleValues: ['REPORTED', 'CLEARED', 'REJECTED', 'VALIDATION_ERROR'] },
  { field: 'errorCode', labelAr: 'رمز خطأ الزكاة', labelEn: 'ZATCA Error Code', category: 'ZATCA', type: 'string' },
  
  // System
  { field: 'userRole', labelAr: 'دور المستخدم', labelEn: 'User Role', category: 'System', type: 'string', sampleValues: ['OWNER', 'CHIEF_ACCOUNTANT', 'ACCOUNTANT', 'SALES_MGR', 'PURCHASES_MGR', 'CASHIER'] },
  { field: 'backupType', labelAr: 'نوع النسخة الاحتياطية', labelEn: 'Backup Type', category: 'System', type: 'string', sampleValues: ['DAILY_FULL', 'MANUAL_EXPORT'] },
];

export const TRIGGER_METADATA: Record<
  TriggerType,
  { labelAr: string; labelEn: string; descriptionAr: string; descriptionEn: string; icon: string; category: string }
> = {
  low_stock_detected: {
    labelAr: 'انخفاض رصيد المخزون',
    labelEn: 'Low Stock Detected',
    descriptionAr: 'عند هبوط كمية صنف في أي مستودع عن نقطة إعادة الطلب',
    descriptionEn: 'When an item stock falls below its minimum reorder point',
    icon: 'Boxes',
    category: 'Inventory',
  },
  document_posted: {
    labelAr: 'ترحيل مستند مالي / فاتورة',
    labelEn: 'Document Posted',
    descriptionAr: 'عند ترحيل فاتورة مبيعات، سند، أو قيد يومية محاسبياً',
    descriptionEn: 'When a sales invoice, voucher, or journal entry is posted to GL',
    icon: 'FileCheck',
    category: 'Sales & Accounting',
  },
  invoice_overdue: {
    labelAr: 'تأخر سداد فاتورة (مستحقات G4)',
    labelEn: 'Invoice Overdue',
    descriptionAr: 'عند تجاوز تاريخ استحقاق الفاتورة دون سداد كامل',
    descriptionEn: 'When an invoice passes its due date with unpaid balance',
    icon: 'Clock',
    category: 'Collections',
  },
  zatca_failure: {
    labelAr: 'فشل إرسال هيئة الزكاة (ZATCA)',
    labelEn: 'ZATCA Transmission Failure',
    descriptionAr: 'عند رفض الفاتورة أو حدوث خطأ أثناء الربط مع منصة فاتورة',
    descriptionEn: 'When invoice clearance or reporting is rejected by ZATCA',
    icon: 'AlertTriangle',
    category: 'Compliance',
  },
  credit_limit_breached: {
    labelAr: 'تجاوز السقف الائتماني للعميل',
    labelEn: 'Credit Limit Breached',
    descriptionAr: 'عند محاولة إصدار فاتورة أو طلب يتجاوز حد العميل المعتمد',
    descriptionEn: 'When customer unpaid balance exceeds approved credit limit',
    icon: 'ShieldAlert',
    category: 'Parties',
  },
  document_created: {
    labelAr: 'إنشاء مستند جديد (مسودة)',
    labelEn: 'Document Created',
    descriptionAr: 'عند حفظ عرض سعر، أمر شراء، أو فاتورة كمسودة',
    descriptionEn: 'When a draft quotation, order, or document is initially created',
    icon: 'FilePlus',
    category: 'Documents',
  },
  document_submitted: {
    labelAr: 'تقديم مستند للاعتماد',
    labelEn: 'Document Submitted for Approval',
    descriptionAr: 'عند تقديم أمر شراء أو سند صرف للاعتماد الإداري',
    descriptionEn: 'When a purchase order or voucher is submitted for review',
    icon: 'Send',
    category: 'Workflow',
  },
  document_approved: {
    labelAr: 'اعتماد المستند رسمياً',
    labelEn: 'Document Approved',
    descriptionAr: 'عند موافقة المدير المالي أو المسؤول على المستند',
    descriptionEn: 'When an authority officially approves the document',
    icon: 'CheckCircle',
    category: 'Workflow',
  },
  payment_received: {
    labelAr: 'استلام دفعة / سند قبض',
    labelEn: 'Payment Received',
    descriptionAr: 'عند تسجيل سند قبض أو تحويل بنكي من عميل',
    descriptionEn: 'When a receipt voucher or bank transfer is confirmed',
    icon: 'Coins',
    category: 'Treasury',
  },
  backup_failure: {
    labelAr: 'فشل النسخ الاحتياطي',
    labelEn: 'Backup Failure',
    descriptionAr: 'عند تعذر إنشاء أو حفظ النسخة الاحتياطية السحابية',
    descriptionEn: 'When automated database backup job fails or times out',
    icon: 'Database',
    category: 'System',
  },
  subscription_event: {
    labelAr: 'حدث اشتراك أو تجديد',
    labelEn: 'Subscription Lifecycle Event',
    descriptionAr: 'عند اقتراب انتهاء الاشتراك السحابي أو ترقية الباقة',
    descriptionEn: 'When SaaS subscription renewal is due or plan changes',
    icon: 'Sparkles',
    category: 'System',
  },
};

export const ACTION_METADATA: Record<
  ActionType,
  { labelAr: string; labelEn: string; descriptionAr: string; descriptionEn: string; icon: string }
> = {
  send_notification: {
    labelAr: 'إرسال إشعار داخلي في النظام',
    labelEn: 'Send In-App Notification',
    descriptionAr: 'تنبيه فوري يظهر في جرس الإشعارات لمستخدمين أو أدوار محددة',
    descriptionEn: 'Instant alert in the notification bell for specific roles or users',
    icon: 'Bell',
  },
  send_email: {
    labelAr: 'إرسال بريد إلكتروني',
    labelEn: 'Send Automated Email',
    descriptionAr: 'إرسال رسالة بريدية مخصصة إلى العميل، المورد، أو الفريق',
    descriptionEn: 'Dispatch custom templated email to customer, vendor, or staff',
    icon: 'Mail',
  },
  create_task: {
    labelAr: 'إنشاء مهمة عمل / تذكرة',
    labelEn: 'Create Actionable Task',
    descriptionAr: 'إسناد مهمة للمسؤول مع تاريخ استحقاق محدد للمتابعة',
    descriptionEn: 'Assign structured task with due date to responsible role',
    icon: 'CheckSquare',
  },
  create_draft_document: {
    labelAr: 'إنشاء مستند مسودة آلي',
    labelEn: 'Generate Draft Document',
    descriptionAr: 'توليد طلب شراء، سند صرف، أو قيد تسوية تلقائياً',
    descriptionEn: 'Auto-generate draft purchase request, expense, or journal voucher',
    icon: 'FileText',
  },
  change_status: {
    labelAr: 'تحديث حالة السجل',
    labelEn: 'Update Entity Status',
    descriptionAr: 'تغيير حالة الفاتورة أو العميل (مثال: إيقاف الحساب أو تجميد)',
    descriptionEn: 'Safely transition status (e.g., hold customer account, flag risk)',
    icon: 'RefreshCw',
  },
  tag_record: {
    labelAr: 'إضافة وسوم وتصنيفات',
    labelEn: 'Apply Tags / Labels',
    descriptionAr: 'إضافة وسوم مثل VIP أو HIGH_VALUE لتسهيل الفلترة والمتابعة',
    descriptionEn: 'Attach tags like VIP or AUDIT_FLAG for tracking and filtering',
    icon: 'Tag',
  },
  call_webhook: {
    labelAr: 'استدعاء خطاف ويب خارجي (Webhook)',
    labelEn: 'Call Outgoing Webhook',
    descriptionAr: 'إرسال بيانات الحدث مشفّرة بتوقيع HMAC-SHA256 لنظام خارجي',
    descriptionEn: 'Trigger external REST HTTP webhook signed with HMAC-SHA256',
    icon: 'Webhook',
  },
  delay_schedule: {
    labelAr: 'تأخير / جدولة تنفيذ إجراء',
    labelEn: 'Delay / Schedule Action',
    descriptionAr: 'تأجيل الإجراء لعدد من الدقائق أو الساعات قبل التنفيذ',
    descriptionEn: 'Postpone nested action execution by specified delay window',
    icon: 'Calendar',
  },
};

/**
 * REST API Client Helpers
 */
export async function apiFetchRules(): Promise<AutomationRule[]> {
  try {
    const res = await fetch('/api/v1/automation/rules');
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (e) {
    console.warn('Fallback to local rules', e);
  }
  return [];
}

export async function apiSaveRule(rule: Partial<AutomationRule>): Promise<AutomationRule> {
  const method = rule.id ? 'PUT' : 'POST';
  const url = rule.id ? `/api/v1/automation/rules/${rule.id}` : '/api/v1/automation/rules';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to save rule');
  return json.data;
}

export async function apiToggleRule(ruleId: string): Promise<AutomationRule> {
  const res = await fetch(`/api/v1/automation/rules/${ruleId}/toggle`, {
    method: 'PATCH',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to toggle rule');
  return json.data;
}

export async function apiDeleteRule(ruleId: string): Promise<boolean> {
  const res = await fetch(`/api/v1/automation/rules/${ruleId}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function apiDryRun(rule: AutomationRule, samplePayload?: Record<string, any>): Promise<DryRunResponse> {
  const res = await fetch('/api/v1/automation/rules/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, samplePayload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Dry-run failed');
  return json.data;
}

export async function apiTriggerEvent(trigger: TriggerType, payload: Record<string, any>): Promise<ExecutionHistoryLog[]> {
  const res = await fetch('/api/v1/automation/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger, payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Trigger execution failed');
  return json.data;
}

export async function apiFetchHistory(filters?: { ruleId?: string; status?: string; trigger?: string }): Promise<ExecutionHistoryLog[]> {
  const params = new URLSearchParams();
  if (filters?.ruleId) params.append('ruleId', filters.ruleId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.trigger) params.append('trigger', filters.trigger);

  const res = await fetch(`/api/v1/automation/history?${params.toString()}`);
  if (res.ok) {
    const json = await res.json();
    return json.data || [];
  }
  return [];
}

export async function apiRetryAction(runId: string, actionId: string): Promise<any> {
  const res = await fetch(`/api/v1/automation/history/${runId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Retry failed');
  return json.data;
}

export async function apiFetchSamplePayloads(): Promise<Record<TriggerType, Record<string, any>>> {
  const res = await fetch('/api/v1/automation/sample-payloads');
  if (res.ok) {
    const json = await res.json();
    return json.data || {};
  }
  return {} as any;
}
